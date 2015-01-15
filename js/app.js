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

    };


    var Marker = function (vResponse) {

        var self = this;

        self.id = 'marker-' + Marker.idNumber;
        self.panoId = 'pano-' + Marker.idNumber++;

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
        self.isWindowInfoOpen = ko.observable(false);

        // Update the marker's color when its state changes
        this.isMouseOver.subscribe(this.updateColor, this);
        this.isWindowInfoOpen.subscribe(this.updateColor, this);
        this.isFocus.subscribe(this.updateColor, this);

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
        google.maps.event.addListener(self.attached.infoWindow, 'closeclick', function() {self.isWindowInfoOpen(false);});

    };

    // Static variable used to create unique id selectors
    // Examples: marker-1, marker-2
    Marker.idNumber = 0;

    // z index to increment when bringing marker or infowindow to focus
    Marker.zIndex = 0;

    // Images for the marker's current state
    // INACTIVE = red
    Marker.prototype.INACTIVE = 'https://mts.googleapis.com/vt/icon/name=icons/spotlight/spotlight-poi.png&scale=1';
    // HOVER = blue
    Marker.prototype.HOVER = 'http://mts.googleapis.com/vt/icon/name=icons/spotlight/spotlight-waypoint-blue.png&scale=1';
    // ACTIVE = green
    Marker.prototype.ACTIVE = 'https://mt.google.com/vt/icon?psize=24&font=fonts/Roboto-Regular.ttf&color=ff330000&name=icons/spotlight/spotlight-waypoint-a.png&ax=44&ay=48&scale=1&text=•';

    /**
     * Close info window if its open
     */
    Marker.prototype.closeInfoWindow = function() {
        if (this.isWindowInfoOpen()) {
            this.attached.infoWindow.close();
            this.isWindowInfoOpen(false);
        }
    };

    Marker.prototype.openInfoWindow = function() {
        if (!this.isWindowInfoOpen()) {
            var marker = this.googleMarker;
            this.loadInfoWindowContent();
            this.attached.infoWindow.open(marker.getMap(), marker);
            this.isWindowInfoOpen(true);
        }
    };

    Marker.prototype.updateColor = function () {
        var color = '';
        if (this.isWindowInfoOpen()) {
            color = this.ACTIVE;
        } else if (this.isMouseOver()) {
            color = this.HOVER;
        } else {
            color = this.INACTIVE;
        }
        this.googleMarker.setIcon(color);
    };

    Marker.prototype.mouseover = function () {
        this.isMouseOver(true);
    };

    Marker.prototype.mouseout = function () {
        this.isMouseOver(false);
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

    Marker.prototype.focus = function () {
        var zIndex = Marker.zIndex++;
        this.googleMarker.setZIndex(zIndex);
        this.attached.infoWindow.setZIndex(zIndex);
    };

    Marker.prototype.setMyMap = function (myMap) {
        this.attached.map = myMap;
        this.googleMarker.setMap(myMap.googleMap);
    };

    Marker.prototype.getMyMap = function () {
        return this.attached.map;
    };

    /**
     * Creates marker's infoWindow content using the
     * html template (#infoWindowTemplate)
     *
     * @returns {HTMLElement} - infowindow content
     */
    Marker.prototype.getInfoWindowcontent = function () {
        var content = $('#foursquareTemplate').html();

        //var height = (this.panoData != null) ? '330px;' : '300px;';
        //content = content.replace('{{style}}', 'height:' + height);
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
        content = content.replace('{{id}}', this.id);
        content = content.replace('{{panoramaClass}}', (this.panoData != null) ? 'panorama' : 'no-panorama');
        content = content.replace('{{phone}}',  this.contact.formattedPhone);

        var div = document.createElement('div');
        div.innerHTML = content;
        var fragment = div.childNodes[1];

        var height = (this.panoData != null) ? '360px' : '200px';
        fragment.style.height = height;

        return fragment;


    };


    Marker.prototype.loadInfoWindowContent = function () {
        this.attached.infoWindow.setContent(this.getInfoWindowcontent());
    };


    /**
     * Sets a click listener to the third parent of infoWindow element.
     */
    Marker.prototype.onDOMInfoWindowReady = function () {

        var panoDiv = document.getElementById(this.panoId);

        // Edit google's generated element to center infoWindow content
        var container = $('#' + this.id).parents()[0];
        $(container).css('width', '100%');

        // Append panorama view to fragment
        if (this.panoData != null) {
            //Pano custom options
            var panoOptions = {
                navigationControl: true,
                enableCloseButton: false,
                addressControl: false,
                linksControl: false,
                visible: true,
                pano: this.panoData,
                navigationControlOptions: { style: google.maps.NavigationControlStyle.ANDROID }
            };
            //add pano to infowindow
            this.panorama = new google.maps.StreetViewPanorama(panoDiv, panoOptions);
            this.panorama.setPosition(this.googleMarker.getPosition());
            this.panorama.setVisible(true);

        } else {
            //$(panoDiv).css("height", "50px",'position','relative');
            $(panoDiv).html('<p><strong>Street View data not found for this location.</strong></p>');
        }

        // InfoWindow sometimes highlights entire div text when opening.
        // Solution: clear text selection when infoWindow opens
        // Code taken from: http://stackoverflow.com/questions/3169786/clear-text-selection-with-javascript
        if (window.getSelection) {
            if (window.getSelection().empty) {  // Chrome
                window.getSelection().empty();
            } else if (window.getSelection().removeAllRanges) {  // Firefox
                window.getSelection().removeAllRanges();
            }
        } else if (document.selection) {  // IE?
            document.selection.empty();
        }



    };

    var ListPanel = function (observableMarkers) {

        var self = this;
        self.isVisible = ko.observable(true);
        self.markers = observableMarkers;

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
        self.placeService = new google.maps.places.PlacesService(self.googleMap);
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
        self.listPanel = new ListPanel(self.markers);

        self.googleMap.controls[google.maps.ControlPosition.BOTTOM_LEFT].push(document.getElementById('listPanel'));

        // Last timeout tracker used in addMarker
        self.activeMarker = null;

        self.searchQuery = function (exploreObject) {

            // Get items from search
            self.fsService.explore(exploreObject, function(data) {

                if (data.meta.code === 200) {

                    var items = data.response.groups[0].items;

                    var requestCount = items.length;
                    var count = 0;
                    for (var i = 0; i < items.length; i++) {
                        var venueId = items[i].venue.id;
                        // Get a more detailed venue for each item
                        self.fsService.venueDetails(venueId, function(data) {

                            if (data.meta.code === 200) {
                                // Create a marker object
                                var marker = new Marker(data.response.venue);
                                self.streetViewService.getPanoramaByLocation(marker.googleMarker.getPosition(), 50, function (data, status) {
                                    if (status == google.maps.StreetViewStatus.OK) {
                                        this.panoData = data.location.pano;
                                    }
                                }.bind(marker));
                                self.markers.push(marker);
                            }
                            count++;
                            if (count == requestCount) {
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
                        //marker.focus();
                    };
                })(marker),i * 100);
            }
        };

        // Centers map on marker
        self.centerOnMarker = function (marker) {
            self.googleMap.panTo(marker.googleMarker.getPosition());
            marker.isFocus(true);
        };

        self.setActiveMarker = function (marker) {
            if (self.activeMarker != null) {
                self.activeMarker.closeInfoWindow();
            }
            marker.focus();
            marker.openInfoWindow();
            self.activeMarker = marker;

        };

        // Keeps map centered when being resized
        google.maps.event.addDomListener(window, 'resize', function() {
            var center = self.googleMap.getCenter();
            google.maps.event.trigger(self.googleMap, 'resize');
            //self.map.fitBounds(self.currentBounds);
            self.googleMap.setCenter(center);
        });


        // default search query when map is first initialized
        self.searchQuery(mapConfig.explore);



    };


    ko.applyBindings(new MapViewModal(mapConfig));
});