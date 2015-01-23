$(document).ready(function() {
    'use strict';

    // Model used to initialize google map
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


    /**
     * My attempt in making a Foursquare service class lolol
     *
     * @param appId - foursquare app id
     * @param secretKey - foursquare secret key (is this even suppose to be visible on client side apps??!?)
     * @param version - foursquare version
     * @param mode - foursquare mode
     * @constructor
     */
    var FourSquareService = function (appId, secretKey, version, mode) {

        var self = this;

        // Foursquare required credentials
        self.appId = ['?client_id=', appId].join('');

        self.secretKey = ['&client_secret=', secretKey].join('');

        self.version = ['&v=' , version].join('');

        self.mode = ['&m=' , mode].join('');

        // supported foursquare query options
        self.queryOptions = {
            explore: 'venues/explore',
            venueDetail: 'venues/',
            search: 'venues/search'
        };

        /**
         * Prepends foursquare base URL and  to queryOption and appends required credentials
         *
         * @param {string} queryOption A string value from queryOptions object
         * @returns {string} fsBaseURL + queryOption + requiredCredentials
         */
        self.getBaseURL = function (queryOption) {
            return ['https://api.foursquare.com/v2/', queryOption, self.appId , self.secretKey , self.version , self.mode].join('');
        };

        /**
         * Makes a foursquare explore query using the specified exploreObject
         * Explore queries return a list of recommended venues near the current location.
         * The current location must be specified in the exploreObject.
         * @param exploreObject more dettails at https://developer.foursquare.com/docs/venues/explore
         * @param callback callback method to handle response
         */
        self.explore = function (exploreObject, callback) {
            var query = [self.getBaseURL(self.queryOptions.explore)];

            // get keys from explore object
            var keys = Object.keys(exploreObject);

            // create url
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                query.push(['&', key, '=', exploreObject[key]].join(''));
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

        /**
         * Makes a venue detail query from the specified venueId
         * Venue queries gives details about a venue, including location, mayorship, tags, tips, specials, and category.
         * https://developer.foursquare.com/docs/venues/venues
         * @param venueId foursquare string identifier for this venue.
         * @param callback callback method to handle response
         */
        self.venueDetails = function(venueId, callback) {

            // create URL
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

        /**
         * Parses a simple string into a foursquare exploreObject
         * e.g 'some query NEAR location'
         *
         * @param queryText
         * @returns {{query: string, near: string}}
         */
        self.queryTextToObject  = function(queryText) {
            queryText = queryText.toLowerCase();
            var end = queryText.lastIndexOf('near');
            var query = queryText.substring(0, end).trim();
            var location = queryText.substring(end + 4).trim();

            return {
                query: query,
                near: location
            };
        };

    };

    /**
     * Creates a marker, with the given venue response.
     * @param vResponse venue response object (https://developer.foursquare.com/docs/responses/venue)
     * @constructor
     */
    var Marker = function (vResponse) {

        var self = this;

        // ID number used to create a unique marker and pano id
        self.id = Marker.idNumber++;
        self.markerId = 'marker-' + self.id;
        self.panoId = 'pano-' + self.id;

        // Marker's data info (used when displaying its infoWindow)
        self.name = vResponse.name;
        self.contact = vResponse.contact;
        self.location = vResponse.location;
        self.rating = vResponse.rating;
        self.website = vResponse.url;
        self.fsWebsite = vResponse.canonicalUrl;

        self.panoData = null;

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

        self.attachedMap = null;

        // notify the attached map when marker is clicked
        google.maps.event.addListener(self.googleMarker, 'click', self.click.bind(this));

        // Event listeners to update the marker's observables
        google.maps.event.addListener(self.googleMarker, 'mouseover', self.mouseover.bind(this));
        google.maps.event.addListener(self.googleMarker, 'mouseout', self.mouseout.bind(this));

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

    // All the markers share a infoWindow instance, so only one info window can be opened at a time.
    // I chose this route because having multiple info windows makes the look cluttered.
    Marker.prototype.googleInfoWindow = new google.maps.InfoWindow({});
    Marker.prototype.$modalInfoWindow = $('#myModal'); // Use a modal to display info window with width < 768px


    /**
     * Closes this marker's info window and updates
     * its observables. (isInfoWindowOpen(), isFocus())
     */
    Marker.prototype.closeInfoWindow = function() {
        this.isInfoWindowOpen(false);
        this.isFocus(false);

        var $modal = this.$modalInfoWindow;
        if ($modal.hasClass('in')) {
            $modal.modal('hide');
        } else {
            this.googleInfoWindow.close();
        }
    };

    /**
     * Opens this marker's info window and updates
     * its observables (isInfoWindowOpen(), isFocus()).
     *
     * When the map is in desktop mode, it
     * will open the google's standard info window. Otherwise,
     * it will display its contents using bootstrap's modal
     */
    Marker.prototype.openInfoWindow = function() {
        this.isInfoWindowOpen(true);
        this.isFocus(true);

        var fragment = this.getInfoWindowcontent();
        this.attachPano(fragment);


        // Display desktop infowindow
        if (this.attachedMap.isDesktopMode) {

            google.maps.event.addListenerOnce(this.googleInfoWindow, 'domready', this.onDOMInfoWindowReady.bind(this));
            google.maps.event.addListenerOnce(this.googleInfoWindow, 'closeclick', function() {
                var map = this.attachedMap;
                // Make sure this marker is no longer active when closed
                if (map != null && map.activeMarker === this) {
                    map.activeMarker = null;
                }
                this.isInfoWindowOpen(false);
                this.isFocus(false);
            }.bind(this));

            this.googleInfoWindow.setContent(fragment);
            var marker = this.googleMarker;
            this.googleInfoWindow.open(marker.getMap(), marker);
        } else {
            // Display modal for devices with width < 768px
            this.loadModal(fragment);
            this.isMouseOver(false); // fixes the marker's color on mobile devices

            // Attach a listener to update isInfoWindowOpen() when modal closes
            this.$modalInfoWindow.on('hide.bs.modal', function() {

                this.isInfoWindowOpen(false);
                this.isFocus(false);

                // Unbind listener when modal closes
                this.$modalInfoWindow.unbind();
            }.bind(this));
        }

    };

    /**
     * Updates the marker's color according to its current state
     */
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

    /**
     * Sets isMouseOver to true.
     * When mouseover is triggered by google map, it make sure the marker is visible inside list view by auto scrolling.
     * If event is triggered by the list view and auto focus is checked, it will center map on marker.
     * @param {(google.maps.MouseEvent|boolean)} event
     */
    Marker.prototype.mouseover = function (event) {
        this.isMouseOver(true);

        // If event is coming from google map
        if (event.latLng) {
            // auto scroll to list item
            $('#list-items').scrollTo('#'+this.id, 200);

        } else if (event === true) { // If event is from listPanel and auto focus is checked
            var map = this.attachedMap;
            if (map != null) {
                // center map on marker
                map.centerOnMarker(this.googleMarker.getPosition());
                this.updateZIndex();
            }
        }
    };

    /**
     * Sets marker's isMouseOver to false, and
     * cancels any autoscroll events
     */
    Marker.prototype.mouseout = function () {

        // Cancel any autoscroll events
        $('#list-items').stop(true, false);

        this.isMouseOver(false);
    };

    /**
     * Tells the attached map that this is the current active marker.
     *
     * This method gets called when the marker is clicked from the google map or
     * the list view.
     */
    Marker.prototype.click = function () {
        var myMap = this.attachedMap;
        if (myMap != null) {
            myMap.setActiveMarker(this);
        }
    };

    /**
     * Sets this marker and its info window to
     * have the highest z-index
     */
    Marker.prototype.updateZIndex = function () {
        var zIndex = Marker.zIndex++;
        this.googleMarker.setZIndex(zIndex);
        this.googleInfoWindow.setZIndex(zIndex);
    };

    /**
     * Attaches the mapViewModel and its googleMap to this marker.
     * Passing the value null will remove marker from map.
     * @param {MapViewModel} mapViewModel
     */
    Marker.prototype.setMyMap = function (mapViewModel) {
        var googleMap = (mapViewModel) ? mapViewModel.googleMap : null;
        this.attachedMap = mapViewModel;
        this.googleMarker.setMap(googleMap);
    };

    /**
     * Creates the marker's info window content using the
     * html template (#foursquareTemplate)
     *
     * @returns {HTMLElement} - info window content
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

        var height;
        // Adjust info window height
        if (this.attachedMap.isDesktopMode) {
            // Make info window 200px when if it doesn't a panorama
            height = (this.panoData != null) ? '360px' : '200px';
        } else {
            // expand modal 100% when display in mobile mode
            height = '100%';
        }
        fragment.style.height = height;

        return fragment;


    };

    /**
     * This method will add a panorama to this marker and append it to the fragment if its panoData != null.
     * If panoData == null, it appends a no street view message to the fragment.
     *
     * @param {HTMLElement} fragment - The fragment returned from getInfoWindowcontent()
     */
    Marker.prototype.attachPano = function(fragment) {
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
            //add pano to info window
            this.panorama = new google.maps.StreetViewPanorama(panoDiv, panoOptions);
        } else {
            $(panoDiv).html('<p><strong>Street View data not found for this location.</strong></p>');
        }
    };

    /**
     * When invoked, it will append the given fragment to #myModal and
     * make its panaorama visible
     * @param {HTMLElement} fragment - The fragment returned from getInfoWindowcontent()
     */
    Marker.prototype.loadModal = function(fragment) {

        var $modal = this.$modalInfoWindow;
        var $title = $modal.find('.modal-title').first();
        var $body = $modal.find('.modal-body').first();

        $title.html($(fragment).find('#title'));
        $body.html(fragment);

        $modal.modal('show');

        // if this marker has a pano, display it!
        if (this.panorama != null) {
            this.panorama.setVisible(true);
        }
    };

    /**
     * This method is called when the div containing the InfoWindow's content is attached to the DOM.
     * When called, it will modify googles generate dom element to expand infoWidow's content to 100%.
     * If the device is not an IE browser, remove any highlighted text. (Some bug I had to work around)
     */
    Marker.prototype.onDOMInfoWindowReady = function () {

        // Edit google's generated element to expand infoWindow content 100%
        var container = $('.gm-style-iw')[0].firstChild;
        $(container).css('width', '100%');

        // if this marker has a pano, display it!
        if (this.panorama) {
            this.panorama.setVisible(true);
        }

        // If you rapidly double click on the marker, its info window would sometimes
        // get fully highlighted prior to opening. A work around this issue is to
        // simply clear the text selection lol I'm pretty certain this issue arised when
        // expading container width to 100%
        if (!bowser.msie) { // Ignore IE browser
            var sel = window.getSelection();
            if (sel) {
                if (sel.collapseToEnd) {
                    sel.collapseToEnd(); // Clear selected text
                }
            }
        }
    };

    /**
     * Creates a list view
     * What does the list view do?
     *  - Displays a list of all the markers attached to myMap
     *  - Provides custom search using foursquare api e.g (pizza near new york city)
     *  - Provides search filter (hides unmatched markers on map and list view)
     *  - When auto focus is checked, centers map on the hovered list item
     * @param myMap {MapViewModel} myMap
     * @constructor
     */
    var ListView = function (myMap) {

        var self = this;

        // list view visible state
        // setting this to false collapses the list view
        self.isVisible = ko.observable(true);

        // collapses/expands list view
        self.toggle = function () {
            self.isVisible(!self.isVisible());
        };

        // The list view title
        self.title = ko.pureComputed(function () {
            return self.isVisible() ? 'Hide List' : 'Show List';
        });

        // The attached map
        self.myMap = myMap;
        // Markers currently on map
        self.markers = myMap.markers;

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
                var activeMarker = self.myMap.activeMarker;
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

        // Returns the #listSearch (search box) placeholder value.
        self.listInfo = ko.computed(function () {
            if (self.radioOption() === 'filter') {
                return 'Filter List...';
            } else {
                return 'Search Foursquare (e.g Tacos near Baton Rouge)'
            }
        });

        /**
         * Returns filtered markers
         * When radio option is equal to 'search', this method will simply return self.markers(). (all markers)
         * Any other value it will iterate through the array and
         * hide/show the appropriate markers, while keeping infoWindow in sync.
         * @type {KnockoutComputed<T>}
         */
        self.filteredMarkers = ko.computed(function () {

            var activeMarker = self.myMap.activeMarker;

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
                var fs = self.myMap.fsService;
                // Create a query object from the input text
                var queryObj = fs.queryTextToObject(self.searchBar());
                // give myMap the query object
                self.myMap.searchQuery(queryObj);
            }
            return true;
        };
    };

    /**
     * Creates a map view modal
     * @param mapConfig - map initialier object
     * @constructor
     */
    var MapViewModel = function (mapConfig) {
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

        // Create a list view
        self.listPanel = new ListView(self);

        // Last timeout tracker used in addMarker
        self.activeMarker = null;

        /**
         * Makes a foursquare query using the exploreObject.
         * When the data request is received, it creates and attaches markers to the map.
         *
         * @param exploreObject more details at https://developer.foursquare.com/docs/venues/explore
         */
        self.searchQuery = function (exploreObject) {

            // Clear the map before making a new query
            self.activeMarker = null;
            self.removeMarkers();

            // Make a query using the explore object
            self.fsService.explore(exploreObject, function(data) {
                if (data.meta.code === 200) {

                    // extract venue items from result
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

                                marker.setMyMap(self);// attach marker on map
                                // add marker to observable array (adds marker to list view)
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
                                self.currentBounds = bounds; // save current bounds (reused when if window resizes)
                            }
                        });

                    }


                }
            });
        };

        /**
         * Changes the center of the map to the given LatLng
         * @param {google.maps.LatLng} position
         */
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
         * Removes the attached markers
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
            if (self.currentBounds && self.activeMarker === null) {
                self.googleMap.fitBounds(self.currentBounds);
            }
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
                    // reset
                    marker.closeInfoWindow();
                    marker.openInfoWindow();
                }
            }

        }, false);



    };
    // highest zIndex
    MapViewModel.zIndex = 0;


    // Create a mapViewModel
    var mapViewModel = new MapViewModel(mapConfig);
    ko.applyBindings(mapViewModel);
    // Make initial query
    mapViewModel.searchQuery(mapConfig.explore);


});