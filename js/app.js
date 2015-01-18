$(document).ready(function() {
    'use strict';

    var mapConfig = {
        canvasId: 'map-canvas',
        panelId: 'myPanel',
        options: {
            center: { lat: 30.4089018, lng: -91.0602644 },
            zoom: 12,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            disableDefaultUI: true,
            noClear: true
        },
        explore: { // Foursquare explore search object
            near: 'baton rouge, LA',
            section: 'food'
        }
    };


    var FourSquareService = function (appId, secretKey, version, mode) {

        var self = this;

        self.appId = ['?client_id=', appId].join('');

        self.secretKey = ['&client_secret=', secretKey].join('');

        self.version = ['&v=' , version].join('');

        self.mode = ['&m=' , mode].join('');

        self.queryOptions = {
            explore: 'venues/explore',
            venueDetail: 'venues/',
            search: 'venues/search'
        };

        self.getBaseURL = function (queryOption) {
            return ['https://api.foursquare.com/v2/', queryOption, self.appId , self.secretKey , self.version , self.mode].join('');
        };

        self.explore = function (searchObject, callback) {
            var query = [self.getBaseURL(self.queryOptions.explore)];

            // get keys from search object
            var keys = Object.keys(searchObject);

            // create url from searchObject
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                query.push(['&', key, '=', searchObject[key]].join(''));
            }

            // replace all whitespace with +
            var url = query.join('').replace(/\s+/g, '+');

            var response = function(data) {
                callback(data);
            };
            $.ajax(url, {
                dataType: 'jsonp',
                success: response,
                fail: response
            });
        };

        self.venueDetails = function(venueId, callback) {

            var url = self.getBaseURL([self.queryOptions.venueDetail, venueId, '/'].join(''));

            var response = function(data) {
                callback(data);
            };
            $.ajax(url, {
                dataType: 'jsonp',
                success: response,
                fail: response
            });

        };

        self.queryTextToObject  = function(queryText) {
            var end = queryText.indexOf('near');
            var query = queryText.substring(0, end).trim();
            var location = queryText.substring(end + 4).trim();

            return {
                query: query,
                near: location
            };
        };

    };


    var Marker = function (vResponse) {

        var self = this;

        self.id = Marker.idNumber++;
        self.markerId = 'marker-' + self.id;
        self.panoId = 'pano-' + self.id;

        self.name = vResponse.name;
        self.contact = vResponse.contact;
        self.location = vResponse.location;
        self.rating = vResponse.rating;
        self.website = vResponse.url;
        self.fsWebsite = vResponse.canonicalUrl;

        self.panoData = null;

        // objects that get attached to this marker
        self.attached = {
            map: null,
            infoWindow: null
        };

        // observables to keep track of marker's state
        self.isFocus = ko.observable(false);
        self.isMouseOver = ko.observable(false);
        self.isInfoWindowOpen = ko.observable(false);

        // Update the marker's color when its state changes
        self.isMouseOver.subscribe(this.updateColor, this);
        self.isInfoWindowOpen.subscribe(this.updateColor, this);
        self.isFocus.subscribe(this.updateColor, this);

        // Create a google marker with drop down animation
        self.googleMarker = new google.maps.Marker({
            title: location.name,
            position: {lat: self.location.lat, lng: self.location.lng},
            animation: google.maps.Animation.DROP
        });

        // Info window to display when the marker is clicked
        // setContent is called right before infowindow opens
        self.attached.infoWindow = new google.maps.InfoWindow({});


        // notify the attached map when marker is clicked
        google.maps.event.addListener(self.googleMarker, 'click', self.click.bind(this));

        // Event listeners to update the marker's observables
        google.maps.event.addListener(self.googleMarker, 'mouseover', self.mouseover.bind(this));
        google.maps.event.addListener(self.googleMarker, 'mouseout', self.mouseout.bind(this));

        google.maps.event.addListener(self.attached.infoWindow, 'domready', self.onDOMInfoWindowReady.bind(this));
        google.maps.event.addListener(self.attached.infoWindow, 'closeclick', function() {self.isInfoWindowOpen(false);});

    };

    // Static variable used to create unique id selectors
    // Examples: marker-1, marker-2
    Marker.idNumber = 0;
    Marker.zIndex = 0; // z index to increment when bringing marker or infowindow to focus

    // Images for the marker's current state
    // INACTIVE = red, HOVER = blue, ACTIVE = green
    Marker.prototype.INACTIVE = 'https://mts.googleapis.com/vt/icon/name=icons/spotlight/spotlight-poi.png&scale=1';
    Marker.prototype.HOVER = 'http://mts.googleapis.com/vt/icon/name=icons/spotlight/spotlight-waypoint-blue.png&scale=1';
    Marker.prototype.ACTIVE = 'https://mt.google.com/vt/icon?psize=24&font=fonts/Roboto-Regular.ttf&color=ff330000&name=icons/spotlight/spotlight-waypoint-a.png&ax=44&ay=48&scale=1&text=•';

    /**
     * Close info window if its open
     */
    Marker.prototype.closeInfoWindow = function() {
        this.isInfoWindowOpen(false);
        this.attached.infoWindow.close();
    };

    Marker.prototype.openInfoWindow = function() {
        this.isInfoWindowOpen(true);
        var marker = this.googleMarker;
        var fragment = this.getInfoWindowcontent();
        this.attachPano(fragment);
        this.attached.infoWindow.setContent(fragment);
        this.attached.infoWindow.open(marker.getMap(), marker);
    };

    Marker.prototype.updateColor = function () {
        var color = '';
        if (this.isInfoWindowOpen()) {
            color = this.ACTIVE;
        } else if (this.isMouseOver()) {
            color = this.HOVER;
        } else {
            color = this.INACTIVE;
        }
        this.googleMarker.setIcon(color);
    };

    Marker.prototype.mouseover = function (autoFocus) {
        this.isMouseOver(true);

        // If hover is from map
        if (autoFocus.latLng) {
            // auto scroll to list item
            $('#list-items').scrollTo('#'+this.id, 200);

        } else if (autoFocus === true) { // If hover is from list-item
            var map = this.attached.map;
            if (map != null) {
                map.centerOnMarker(this.googleMarker.getPosition());
                this.updateZIndex();
            }
        }
    };

    Marker.prototype.mouseout = function () {

        // Cancel any autoscroll events
        $('#list-items').stop(true, false);

        this.isMouseOver(false);
        if (!this.isInfoWindowOpen() && this.isFocus()) {
            this.isFocus(false);
        }
    };

    /**
     * Tells the attached map that this is the current active marker
     */
    Marker.prototype.click = function () {
        var myMap = this.attached.map;
        if (myMap != null) {
            myMap.setActiveMarker(this);
        }
    };

    Marker.prototype.updateZIndex = function () {
        var zIndex = Marker.zIndex++;
        this.googleMarker.setZIndex(zIndex);
        this.attached.infoWindow.setZIndex(zIndex);
    };

    Marker.prototype.setMyMap = function (myMap) {
        var googleMap = (myMap) ? myMap.googleMap : null;
        this.attached.map = myMap;
        this.googleMarker.setMap(googleMap);
    };

    /**
     * Creates the marker's infoWindow content using the
     * html template (#foursquareTemplate)
     *
     * @returns {HTMLElement} - infowindow content
     */
    Marker.prototype.getInfoWindowcontent = function () {
        var content = $('#foursquareTemplate').html();

        var rating;
        if (this.rating != undefined) {
            rating = ['<strong>Rating: </strong>',this.rating].join('');
        } else {
            rating = '<strong>No Ratings</strong>';
        }

        // Make title a link to home website
        var title = ['<a href="', this.website,'" target="_blank">', this.name,'</a>'].join('');

        // create more info link directing to foursquare
        var moreInfo = ['<a href="', this.fsWebsite,'" target="_blank">More Info</a>'].join('');

        var formattedAddress = [
            this.location.address, '<br>',
            this.location.formattedAddress[1], '<br>',
            this.location.formattedAddress[2]
        ].join('');


        content = content.replace('{{info}}', moreInfo);
        content = content.replace('{{address}}', formattedAddress);
        content = content.replace('{{title}}', title);
        content = content.replace('{{rating}}', rating);
        content = content.replace('{{panoId}}', this.panoId);
        content = content.replace('{{id}}', this.markerId);
        content = content.replace('{{panoramaClass}}', (this.panoData != null) ? 'panorama' : 'no-panorama');
        content = content.replace('{{phone}}',  this.contact.formattedPhone);

        var div = document.createElement('div');
        div.innerHTML = content;
        var fragment = div.childNodes[1];

        var height = (this.panoData != null) ? '370px' : '200px';
        fragment.style.height = height;

        return fragment;


    };

    Marker.prototype.attachPano = function(fragment) {
        //var panoDiv = document.getElementById(this.panoId);
        var panoDiv = $(fragment).find('#' + this.panoId)[0];

        // Append panorama view to fragment
        if (this.panoData != null) {
            //Pano custom options
            var panoOptions = {
                navigationControl: true,
                enableCloseButton: false,
                addressControl: false,
                linksControl: false,
                visible: false,
                pano: this.panoData,
                navigationControlOptions: { style: google.maps.NavigationControlStyle.ANDROID }
            };
            //add pano to infowindow
            this.panorama = new google.maps.StreetViewPanorama(panoDiv, panoOptions);
            //this.panorama.setPosition(this.googleMarker.getPosition());
            //this.panorama.setVisible(true);
            //this.panorama.setPano(this.panoData);
        } else {
            //$(panoDiv).css("height", "50px",'position','relative');
            $(panoDiv).html('<p><strong>Street View data not found for this location.</strong></p>');
        }
    };

    /**
     * Sets a click listener to the third parent of infoWindow element.
     */
    Marker.prototype.onDOMInfoWindowReady = function () {

        var panoDiv = document.getElementById(this.panoId);

        // Edit google's generated element to expand infoWindow content
        var container = $('#' + this.markerId).parents()[0];
        $(container).css('width', '100%');

        if (this.panorama) {
            this.panorama.setVisible(true);
        }
        if (window.getSelection) {
            var sel = window.getSelection();
            if (sel.collapseToEnd) {
                sel.collapseToEnd();
            }
        }

        this.attached.infoWindow.getPosition();
    };

    var ListPanel = function (map) {

        var self = this;
        self.isVisible = ko.observable(true);

        self.map = map;
        self.markers = map.markers;

        self.searchBar = ko.observable('');

        self.radioOption = ko.observable('filter');

        self.autoFocus = ko.observable(false);


        self.listInfo = ko.computed(function () {
            if (self.radioOption() === 'filter') {
                return 'Filter List...';
            } else {
                return 'Search Foursquare...'
            }
        });

        self.filterMarkers = ko.computed(function () {

            var activeMarker = self.map.activeMarker;

            if (self.searchBar().length == 0 || self.radioOption() != 'filter') {

                // Make every marker visible
                for (var i = 0; i < self.markers().length; i++) {
                    var gMarker = self.markers()[i].googleMarker;

                    if (!gMarker.getVisible()) {
                        // Reopene infoWindow
                        gMarker.setVisible(true);
                        if (activeMarker != null) {
                            activeMarker.openInfoWindow();
                        }
                    }
                }
                return self.markers();

            } else {
                return ko.utils.arrayFilter(self.markers(), function (marker) {
                    // Compare the marker's name with search bar text
                    var text = self.searchBar().toLowerCase();
                    var name = marker.name.toLowerCase();

                    var isVisible = (name.indexOf(text) >= 0);

                    var gMarker = marker.googleMarker;

                    // Update google marker only if needed
                    if (gMarker.getVisible() != isVisible) {

                        gMarker.setVisible(isVisible);

                        // Reopen infoWindow if it was closed by this filter
                        if (isVisible && activeMarker == marker) {
                            marker.openInfoWindow();
                        } else if (marker.isInfoWindowOpen()) {

                            // Keep track of infoWindow that is closed by this filter
                            // So if the user cancels his filter we can reopen his last
                            // infoWindow
                            activeMarker = marker;
                            marker.closeInfoWindow();
                        }

                    }
                    return isVisible;
                });
            }
        });

        self.searchInput = function(data, event) {

            // Make query when user hits the enter key,
            if (event.keyCode === 13 && self.radioOption() == 'search' ) { // make sure search radio button is selected

                // Get foursquare service
                var fs = self.map.fsService;
                // Create a query object from the input text
                var queryObj = fs.queryTextToObject(self.searchBar());
                // make query
                self.map.searchQuery(queryObj);
            }
            return true;
        };

        // The list panel title
        self.title = ko.pureComputed(function () {
            return self.isVisible() ? 'Hide List' : 'Show List';
        });

        self.close =  function () {
            self.isVisible(false);
        };

        self.open = function () {
            self.isVisible(true);
        };

        self.toggle = function () {
            self.isVisible(!self.isVisible());
        };


    };

    var MapViewModal = function (mapConfig) {
        var self = this;

        // Create google map
        self.googleMap = new google.maps.Map(document.getElementById(mapConfig.canvasId), mapConfig.options);

        // Initialize google services
        self.streetViewService = new google.maps.StreetViewService();

        // Create foursquare service object
        self.fsService = new FourSquareService(
          'DNHYJ5KY031FDOFXBAFROUXSDHJBLLFVKIBX5FVO10QWSU3J', // appId
          'TLJHOC3BO5LFV31JB3VTXTRGZYXWG5DJISR3M3STUXR14Q4J',  // secretKey
          '20140806', // version
          'foursquare' // mode
        );

        // Initialize observable array to hold the map's markers
        self.markers = ko.observableArray([]);

        // Create a list panel
        self.listPanel = new ListPanel(self);

        // Last timeout tracker used in addMarker
        self.activeMarker = null;

        self.searchQuery = function (exploreObject) {

            // Clear the map before making a new query
            self.removeMarkers();

            // Get venue items from query
            self.fsService.explore(exploreObject, function(data) {
                if (data.meta.code === 200) {

                    // extract items
                    var items = data.response.groups[0].items;

                    var requestCount = items.length;
                    var count = 0;

                    var bounds = new google.maps.LatLngBounds();

                    // Use the venue id of each item to make venueDetails request
                    for (var i = 0; i < items.length; i++) {
                        var venueId = items[i].venue.id;

                        // Get a more detailed venue for each item
                        self.fsService.venueDetails(venueId, function(data) {


                            if (data.meta.code === 200) {
                                // Create a marker from venue object
                                var marker = new Marker(data.response.venue);

                                // Check if google map has a panorama view for this location
                                self.streetViewService.getPanoramaByLocation(marker.googleMarker.getPosition(), 50, function (data, status) {
                                    if (status == google.maps.StreetViewStatus.OK) {
                                        // save pano
                                        this.panoData = data.location.pano;
                                    }
                                }.bind(marker));
                                bounds.extend(marker.googleMarker.getPosition());
                                self.markers.push(marker);
                            }

                            if (++count == requestCount) {
                                self.googleMap.fitBounds(bounds);
                                self.attachMarkers();
                            }
                        });

                    }


                }
            });
        };

        // Attaches each marker with i * 100 delay, i = marker's array index
        self.attachMarkers = function () {

            for(var i = 0; i < self.markers().length; i++) {
                var marker = self.markers()[i];
                // set timeout animation
                setTimeout((function(marker) {
                    return function () {
                        marker.setMyMap(self);
                        marker.updateZIndex();
                    };
                })(marker),i * 100);
            }
        };

        // Centers map on marker
        self.centerOnMarker = function (position) {
            self.googleMap.panTo(position);
        };

        self.setActiveMarker = function (marker) {

            // close previous marker
            if (self.activeMarker != null && self.activeMarker != marker) {
                self.activeMarker.closeInfoWindow();
                self.activeMarker.isFocus(false);
            }

            // Toggle marker infoWindow
            if (marker.isInfoWindowOpen()) {
                marker.closeInfoWindow();
            } else {
                marker.openInfoWindow();
                marker.updateZIndex();
                self.centerOnMarker(marker.googleMarker.getPosition());
            }

            self.activeMarker = marker;
        };

        self.removeMarkers = function () {

            var markers = self.markers.removeAll();

            for (var i = 0; i < markers.length; i++) {
                var marker = markers.pop();
                marker.setMyMap(null);
                marker.googleMarker = null;
            }

        };
        // Keeps map centered when being resized
        google.maps.event.addDomListener(window, 'resize', function() {
            var center = self.googleMap.getCenter();
            google.maps.event.trigger(self.googleMap, 'resize');
            //self.map.fitBounds(self.currentBounds);
            self.googleMap.setCenter(center);
        });
    };



    var mapViewModal = new MapViewModal(mapConfig);
    mapViewModal.searchQuery(mapConfig.explore);
    ko.applyBindings(mapViewModal);
});