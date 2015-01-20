$(document).ready(function() {
    'use strict';

    var mapConfig = {
        canvasId: 'map-canvas',
        panelId: 'myPanel',
        options: {
            center: { lat: 30.433723460, lng: -91.12495604 },
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
        google.maps.event.addListener(self.attached.infoWindow, 'closeclick', function() {
            var map = self.attached.map;
            if (map !== null && map.activeMarker === self) {
                map.activeMarker = null;
            }
            self.closeInfoWindow();
        });

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
        this.isFocus(false);

        var $modal = $('#myModal');
        if ($modal.hasClass('in')) {
            console.log('modal');
            $modal.modal('hide');
        } else {
            console.log('close');
            this.attached.infoWindow.close();
        }


    };

    Marker.prototype.openInfoWindow = function() {
        this.isInfoWindowOpen(true);
        this.isFocus(true);

        var fragment = this.getInfoWindowcontent();
        this.attachPano(fragment);


        // Display desktop infowindow
        if (this.attached.map.isDesktopMode) {
            this.attached.infoWindow.setContent(fragment);
            var marker = this.googleMarker;
            this.attached.infoWindow.open(marker.getMap(), marker);
        } else {
            // Display modal for devices with width <= 480
            this.loadModal(fragment);
            this.isMouseOver(false); // fixes the marker's color on mobile devices

            // Attach a listener to update isInfoWindowOpen() when modal closes
            $('#myModal').on('hide.bs.modal', function() {

                this.isInfoWindowOpen(false);
                this.isFocus(false);

                // Unbind listener when modal closes
                $('#myModal').unbind();
            }.bind(this));
        }

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

        } else if (autoFocus === true) { // If hover is from listPanel and auto focus is checked
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
        //console.log(myMap);
        //console.log(myMap.currentMode);
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


        // set height depending
        var minH = (this.attached.map.isDesktopMode) ? '360px' : '100%';
        var height = (this.panoData != null) ? minH : '200px';
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

    Marker.prototype.loadModal = function(contents) {

        $($('.modal-title').get(0)).html($(contents).find('#title'));
        $($('.modal-body').get(0)).html(contents);
        //$($('.modal-body').get(0)).prepend(contents);


        $('#myModal').modal('show');

        //this.panorama.setPosition(this.googleMarker.getPosition());
        //this.panorama.setPano(this.panoData);
        if (this.panorama != null) {
            this.panorama.setVisible(true);
        }




    };

    /**
     * Sets a click listener to the third parent of infoWindow element.
     */
    Marker.prototype.onDOMInfoWindowReady = function () {

        // Edit google's generated element to expand infoWindow content 100%
        var container = $('.gm-style-iw')[0].firstChild;
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

    };

    var ListPanel = function (map) {

        var self = this;

        // List panel visible state
        // setting this to false collapses the list panel
        self.isVisible = ko.observable(true);

        // collapses/expands list panel
        self.toggle = function () {
            self.isVisible(!self.isVisible());
        };

        // The list panel title
        self.title = ko.pureComputed(function () {
            return self.isVisible() ? 'Hide List' : 'Show List';
        });

        // The attaches map
        self.map = map;
        // Markers currently on map
        self.markers = map.markers;

        // Search bar used to make foursquare queries and filter map markers
        self.searchBar = ko.observable('');

        // When checked, listpanel will auto focus map on the hovered list item (marker).
        self.autoFocus = ko.observable(false);

        // search bar radio button
        // value: search, uses search bar input to make foursquare query when user presses enter
        // value filter, uses search bar input to filter markers on the map and listpanel
        self.radioOption = ko.observable('search');

        // When changing radioOption value from filter to search, make sure all markers are
        // visible on the map and reopen active marker if needed
        self.radioOption.subscribe(function (option) {
            if (option === 'search') {
                var activeMarker = self.map.activeMarker;
                // Make every marker visible on map
                for (var i = 0; i < self.markers().length; i++) {
                    var gMarker = self.markers()[i].googleMarker;

                    if (!gMarker.getVisible()) {
                        gMarker.setVisible(true);
                    }
                }
                // Reopene infoWindow if needed
                if (activeMarker != null && !activeMarker.isInfoWindowOpen()) {
                    activeMarker.openInfoWindow();
                }
            }
        });

        // ListPanel searchbar placeholder to display, value changes when radioOption is changed
        self.listInfo = ko.computed(function () {
            if (self.radioOption() === 'filter') {
                return 'Filter List...';
            } else {
                return 'Search Foursquare (e.g Tacos near Baton Rouge)'
            }
        });

        /**
         * Markers to display on list panel and map.
         *
         * If radio option is equal to 'search', it will simply return self.markers(),
         * else it will filter through the array and hide the appropriate markers,
         * while still keeping infoWindow in sync.
         * @type {KnockoutComputed<T>}
         */
        self.filterMarkers = ko.computed(function () {

            var activeMarker = self.map.activeMarker;

            if (self.radioOption() === 'search')
                return self.markers();
            else
                return ko.utils.arrayFilter(self.markers(), function (marker) {
                    // Compare the marker's name with search bar text
                    var text = self.searchBar().toLowerCase();
                    var name = marker.name.toLowerCase();

                    // get this marker's new visible value
                    var isVisible = (name.indexOf(text) >= 0);

                    var gMarker = marker.googleMarker;

                    // Update marker only if needed
                    if (gMarker.getVisible() != isVisible) {

                        gMarker.setVisible(isVisible);
                        // Check if this marker is active
                        if (activeMarker === marker) {

                            var isActiveVisible = marker.isInfoWindowOpen();
                            // Open/close infoWindow only if needed
                            if (isVisible) {
                                if (!isActiveVisible)   // show infoWindow if its closed
                                    marker.openInfoWindow();
                            } else {
                                if (isActiveVisible) // close infoWindow if its open
                                    marker.closeInfoWindow();
                            }
                        }
                    }
                    return isVisible;
                });
        });

        // Make a foursquare query when user presses enter key
        self.searchBarInput = function(data, event) { // called by the search bar on 'keyup' event
            // If keyCode != enter key,
            if (event.keyCode !== 13) {
                return true;
            } else if (self.radioOption() == 'search') { // make sure search radio button is selected
                // Get foursquare service
                var fs = self.map.fsService;
                // Create a query object from the input text
                var queryObj = fs.queryTextToObject(self.searchBar());
                // make query
                self.map.searchQuery(queryObj);
            }
            return true;
        };
    };

    /**
     * Creates a map from the given mapConfig.
     * @param mapConfig - map initialier object
     * @constructor
     */
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

        /**
         * Makes a foursquare query with the given object, then
         * creates and attaches markers to the map with the received data
         * @param exploreObject - the given object
         */
        self.searchQuery = function (exploreObject) {

            // Clear the map before making a new query
            self.activeMarker = null;
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

                                // attach marker on map
                                marker.setMyMap(self);
                                // add marker to observable array to sync map markers with listPanel
                                self.markers.push(marker);
                                marker.updateZIndex();

                                // Check if google map has a panorama view for this location
                                self.streetViewService.getPanoramaByLocation(marker.googleMarker.getPosition(), 50, function (data, status) {
                                    if (status == google.maps.StreetViewStatus.OK) {
                                        // save pano to marker
                                        this.panoData = data.location.pano;
                                    }
                                }.bind(marker));
                                bounds.extend(marker.googleMarker.getPosition());
                            }

                            if (++count == requestCount) {
                                // Update map bounds after retreiving all the markers
                                self.googleMap.fitBounds(bounds);
                                console.log(bounds.getCenter());
                            }
                        });

                    }


                }
            });
        };

        // Centers map on marker
        self.centerOnMarker = function (position) {
            self.googleMap.panTo(position);
        };

        /**
         * This method gets called by the clicked marker.
         * If the clicked marker is equal to the maps active marker, close its infoWindow and set active marker to null.
         * else close previous marker and make the clicked marker active.
         * @param marker - the clicked marker
         */
        self.setActiveMarker = function (marker) {

            // if they're the same close infoWindow and set active marker to null
            if (self.activeMarker === marker) {
                marker.closeInfoWindow();
                self.activeMarker = null;
            } else {

                if (self.activeMarker !== null) // close previous active marker
                    self.activeMarker.closeInfoWindow();

                self.activeMarker = marker; // set new active marker

                // open marker's infoWindow and center it on map
                marker.openInfoWindow();
                self.activeMarker.updateZIndex();
                self.centerOnMarker(self.activeMarker.googleMarker.getPosition());
            }

        };

        /**
         * Removes the attached markers from this map
         */
        self.removeMarkers = function () {
            var markers = self.markers.removeAll();
            var marker;
            while (marker = markers.pop())
                marker.setMyMap(null);
        };

        // Keeps map centered when being resized
        google.maps.event.addDomListener(window, 'resize', function() {
            var center = self.googleMap.getCenter();
            google.maps.event.trigger(self.googleMap, 'resize');
            //self.map.fitBounds(self.currentBounds);
            self.googleMap.setCenter(center);
        });

        self.isDesktopMode = window.matchMedia("screen and (min-width: 768px)").matches;

        // Change infoWindow to display as a modal or google's infoWindow depending on the browser's width
        window.addEventListener('resize', function () {

            // get browser current mode using media query to gaurantee precision
            var mql = window.matchMedia("screen and (min-width: 768px)");
            var displayMode = mql.matches;

            // Only update infowindow when needed
            if (displayMode !== self.isDesktopMode) {
                self.isDesktopMode = displayMode;

                var marker = self.activeMarker;
                if (marker !== null) {
                    marker.closeInfoWindow(); // close current infoWindow (modal or google's infowindow)
                    marker.openInfoWindow(); // reopen
                }
            }

        }, false);



    };

    // Create a mapViewModal
    var mapViewModal = new MapViewModal(mapConfig);
    ko.applyBindings(mapViewModal);
    // Make initial query
    mapViewModal.searchQuery(mapConfig.explore);


});