'use strict';

/**
 * Gets called when google maps is initialized after the DOM has loaded
 **/
function initialize() {

    // Model used to initialize google map
    var mapConfig = {
        canvasId: 'map-canvas',
        panelId: 'myPanel',
        options: {
            center: { lat: 30.433723460, lng: -91.12495604 },
            zoom: 12,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            disableDefaultUI: true,
            noClear: true,
            styles: [
                {
                    featureType: "poi",
                    elementType: "labels",
                    stylers: [
                        { visibility: "off" }
                    ]
                }
            ]
        },
        explore: { // Foursquare explore search object
            near: 'baton rouge, LA',
            section: 'food'
        }
    };


    /**
     * FourSquareService class used for encapsulating foursquare's API
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
         * Prepends foursquare base URL to queryOption and appends required credentials
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
                error: response,
                timeout: 4000
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
                error: response,
                timeout: 3000
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
            var end = queryText.lastIndexOf(' near ');
            var location;
            var query;
            // ignore location is no near index is found
            if (end == -1) {
                location = queryText.trim();
                query = queryText.trim();
            } else {
                query = queryText.substring(0, end).trim();
                location = queryText.substring(end + 6).trim();
            }

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
        self.id = 'list-item-' + Marker.idNumber;
        self.markerId = 'marker-' + Marker.idNumber;
        self.panoId = 'pano-' + Marker.idNumber++;

        // Below are the marker's contact info (used when displaying its infoWindow)
        self.name = vResponse.name;

        self.contact = vResponse.contact;
        var phone = this.contact.formattedPhone;
        self.formattedPhone = (phone) ? phone : 'Unknown';

        self.rating = vResponse.rating;

        self.website = vResponse.url;
        self.fsWebsite = vResponse.canonicalUrl;

        self.location = vResponse.location;
        // If foursquare doen'st have an address
        // for this veneue replace it with 'Unknown'
        if (self.location.address) {
            self.street = self.location.address;
            self.cityStateZip = self.location.formattedAddress[1];
            self.country = self.location.formattedAddress[2];
        } else {
            self.street = 'Unknown';
            self.cityStateZip = '';
            self.country = '';
        }

        self.panoData = null;

        // observables used for dynamically updating the info window
        self.containsPano = ko.observable(false);
        self.panoCSS = ko.pureComputed(function () {
            return self.containsPano() ? 'panorama' : 'no-panorama';
        });
        // observables to keep track of marker's state (used in list panel to highlight list items)
        self.isMouseOver = ko.observable(false);
        self.isInfoWindowOpen = ko.observable(false);

        // Create a google marker with drop down animation
        self.googleMarker = new google.maps.Marker({
            title: location.name,
            position: {lat: self.location.lat, lng: self.location.lng},
            animation: google.maps.Animation.DROP
        });

        // The map that this marker is attached to
        self.attachedMap = null;

        // notify the attached map when marker is clicked
        google.maps.event.addListener(self.googleMarker, 'click', self.click.bind(this));

        // Event listeners to update the marker's observables
        google.maps.event.addListener(self.googleMarker, 'mouseover', self.mouseover.bind(this));
        google.maps.event.addListener(self.googleMarker, 'mouseout', self.mouseout.bind(this));

    };

    // Static variable used to create unique id selectors
    // Examples: marker-1, marker-2 (needed when using auto scroll in list panel)
    Marker.idNumber = 0;
    Marker.zIndex = 0; // z index to increment when bringing marker or info window to focus

    // Images for the marker's current state
    // INACTIVE = red, HOVER = blue, ACTIVE = green with dot, CLOSE = green with X
    Marker.prototype.INACTIVE = 'https://mts.googleapis.com/vt/icon/name=icons/spotlight/spotlight-poi.png&scale=1';
    Marker.prototype.HOVER = 'http://mts.googleapis.com/vt/icon/name=icons/spotlight/spotlight-waypoint-blue.png&scale=1';
    Marker.prototype.ACTIVE = 'https://mt.google.com/vt/icon?psize=24&font=fonts/Roboto-Regular.ttf&color=ff330000&name=icons/spotlight/spotlight-waypoint-a.png&ax=44&ay=48&scale=1&text=•';
    Marker.prototype.CLOSE = 'https://mt.google.com/vt/icon?psize=18&font=fonts/Roboto-Regular.ttf&color=ff330000&name=icons/spotlight/spotlight-waypoint-a.png&ax=44&ay=48&scale=1&text=x';

    // All the markers share single info window instance, so only one info window can be opened at a time.
    // I chose this route because having multiple info windows open makes the map look cluttered.
    Marker.prototype.googleInfoWindow = new google.maps.InfoWindow({});
    Marker.prototype.$modalInfoWindow = $('#myModal'); // Use modal infoWindow for devives with < 768px width
    Marker.prototype.$infoWindow = $('#infoWindow'); // Use default infoWindow with >= 768px width

    /**
     * Closes this marker's info window and updates
     * its observables.
     */
    Marker.prototype.closeInfoWindow = function() {

        // To prevent google maps from deleting our info window content
        // append it back to body before closing the infoWindow
        $('body').append(this.$infoWindow);

        // update observable and its current state
        this.isInfoWindowOpen(false);
        this.updateColor();

        // Close the modal if its open, else close google's info window
        var $modal = this.$modalInfoWindow;
        if ($modal.hasClass('in')) {
            $modal.modal('hide');
        } else {
            this.googleInfoWindow.close();
        }
    };

    /**
     * Opens this marker's info window and updates
     * its observables.
     *
     * When the map is in desktop mode, it
     * will open the google's standard info window. Otherwise,
     * it will display its contents using bootstrap's modal
     */
    Marker.prototype.openInfoWindow = function() {
        this.isInfoWindowOpen(true);
        this.updateColor();
        // Append panorama
        this.attachPano();

        // Display desktop infowindow
        if (this.attachedMap.isDesktopMode()) {

            google.maps.event.addListenerOnce(this.googleInfoWindow, 'domready', this.onDOMInfoWindowReady.bind(this));
            google.maps.event.addListenerOnce(this.googleInfoWindow, 'closeclick', function() {
                this.closeInfoWindow();
                var map = this.attachedMap;
                // Make sure this marker is no longer active when closed
                if (map != null && map.activeMarker() === this) {
                    map.activeMarker(null);
                }
            }.bind(this));

            // append info window content back to google's info window
            this.googleInfoWindow.setContent(this.$infoWindow.get(0));
            var marker = this.googleMarker;

            this.googleInfoWindow.open(marker.getMap(), marker);
        } else {

            // fixes the marker's color on mobile devices
            // after being clicked
            this.isMouseOver(false);
            // Display modal for devices with width < 768px
            this.loadModal();
        }

    };

    /**
     * This method gets called by the marker's openInfoWindow() if the device
     * is in mobile mode.
     */
    Marker.prototype.loadModal = function() {


        // Attach a listener to update isInfoWindowOpen() when modal closes
        this.$modalInfoWindow.on('hide.bs.modal', function() {
            // Unbind listener when modal closes
            this.$modalInfoWindow.unbind();
            var map = this.attachedMap;
            // Make sure this marker is no longer active when closed
            if (!map.isResizing) {
                this.isInfoWindowOpen(false);
                this.updateColor();
                // Make sure this marker is no longer active when closed
                if (map != null && map.activeMarker() === this) {
                    map.activeMarker(null);
                }
            }
        }.bind(this));
        var $modal = this.$modalInfoWindow;
        //var $title = $modal.find('.modal-title').first();
        var $body = $modal.find('.modal-body').first();

        //$title.html($(fragment).find('#title'));
        $body.html(this.$infoWindow.get(0));

        $modal.modal('show');

        // if this marker has a pano, display it!
        if (this.panorama != null) {
            this.panorama.setVisible(true);
        }
    };

    /**
     * Updates the marker's color according to its current state
     */
    Marker.prototype.updateColor = function () {

        var color = '';
        if (this.isInfoWindowOpen()) {
            if (this.isMouseOver()) {
                color = this.CLOSE;
            } else {
                color = this.ACTIVE;
            }
        } else if (this.isMouseOver()) {
            color = this.HOVER;
        } else {
            color = this.INACTIVE;
        }
        this.googleMarker.setIcon(color);
    };

    /**
     * Sets isMouseOver to true.
     * This method will center map on marker when the event is trigger by the list view. (auto focus also has to be checked).
     * If event triggered by the map, it will call the scrollTo method on #list-items to make the item visible
     * in list view
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

        this.updateColor();
    };

    /**
     * Sets marker's isMouseOver to false, and
     * cancels any autoscroll events
     */
    Marker.prototype.mouseout = function () {

        // Cancel any autoscroll events
        $('#list-items').stop(true, false);

        this.isMouseOver(false);
        this.updateColor();

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
     * This method will add a panorama to this marker's info window, if its panoData != null.
     * When panoData is == to null, it will append a no panorama message to the info window
     */
    Marker.prototype.attachPano = function() {
        var panoDiv = this.$infoWindow.find('#myPano')[0];

        // Append panorama view
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
     * This method is called when the div containing the InfoWindow's content is attached to the DOM.
     * It will modify the infoWindow's container to 'overflow: visible' to properly display
     * the info window content.
     */
    Marker.prototype.onDOMInfoWindowReady = function () {

        // Edit google's generated element to expand infoWindow content 100%
        var container = $($('.placeInfo')[0]).parent();
        $(container).css('overflow', 'visible');

        // if this marker has a pano, display it!
        if (this.panorama) {
            this.panorama.setVisible(true);
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

        // The attached map
        self.myMap = myMap;
        // Markers currently on map
        self.markers = myMap.markers;

        // list view visible state
        // setting this to false collapses the list view
        self.isVisible = ko.observable(false);

        // auto focus on search bar when user opens list view
        self.isVisible.subscribe(function(isVisible) {
            if (isVisible && self.myMap.isDesktopMode()) { // ignore mobile devices
                setTimeout(function () {
                    $('#searchBar').focus();

                }, 500);
            }
        });
        // collapses/expands list view
        self.toggle = function () {
            self.isVisible(!self.isVisible());
        };

        // The list view title
        self.title = ko.pureComputed(function () {
            return self.isVisible() ? 'Hide List' : 'Show List';
        });



        // Search bar input value used for making foursquare queries and filtering the map's markers
        self.searchBar = ko.observable('');

        // When checked, list view will auto focus map on the hovered list item (marker).
        self.autoFocus = ko.observable(false);

        // When checked, list view will automatically close when user clicks on list item
        self.autoClose = ko.observable(false);

        // search bar radio button
        // value: search, uses search bar input to make foursquare query when user presses enter
        // value: filter, uses search bar input to filter markers on the map and list view (on keyup event)
        self.radioOption = ko.observable('search');

        // When changing radioOption value from filter to search, make sure all markers are
        // visible on the map and reopen active marker if needed
        self.radioOption.subscribe(function (option) {
            if (option === 'search') {
                var activeMarker = self.myMap.activeMarker();
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

            var activeMarker = self.myMap.activeMarker();

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

        // Make a foursquare query when user presses enter key (radioOption value also needs to be == 'search')
        self.searchBarInput = function(data, event) { // called by the search bar on 'keyup' event
            // If keyCode == enter key,
            if (event.keyCode == 13 && self.radioOption() == 'search') { // make sure search radio button is selected
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
     * MapViewModel overview:
     * @param mapConfig - map initialier object
     * @constructor
     */
    var MapViewModel = function (mapConfig) {
        var self = this;

        // Pops up a modal alert message when
        // startAlertMessage is set to true
        // (used for indicating the user when a foursquare query fails)
        self.startAlertMessage = ko.observable(false);
        self.setAlertMessage = ko.observable("");
        self.startAlertMessage.subscribe(function(failed) {
            if (failed) {
                $('#alertModal').modal('show');
                // reset startAlertMessage back to false when modal closes
                $('#alertModal').on('hide.bs.modal', function () {
                    self.startAlertMessage(false);
                    $('#alertModal').unbind();
                });
            }
        });

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

        // The marker currently displaying its info window content
        self.activeMarker = ko.observable(null);

        // Create a list view
        self.listPanel = new ListView(self);

        if (self.googleMap == null) {
            self.setAlertMessage("Failed to load google maps. Please try again later.");
            self.startAlertMessage(true);
        }

        /**
         * Makes a foursquare query using the exploreObject.
         * When the data request is received, it creates and attaches markers to the map.
         *
         * @param exploreObject more details at https://developer.foursquare.com/docs/venues/explore
         */
        self.searchQuery = function (exploreObject) {
            // Auto close list panel when user makes a query on mobile devices,
            // so the markers can be seen on the map.
            if (!self.isDesktopMode() && self.listPanel.isVisible()) {
                self.listPanel.isVisible(false);
            }
            // Clear the map before making a new query
            if (self.activeMarker() != null) {
                // properly close the info window before setting it to null
                self.activeMarker().closeInfoWindow();
                self.activeMarker(null);
            }
            self.removeMarkers();

            // Make a query using the explore object
            self.fsService.explore(exploreObject, function(data) {

                // Check if there was a connection error
                // `data.statusText` is defined when ajax.timeout limit is reached
                if (data.statusText != null) {
                    self.startAlertMessage(true);
                    self.setAlertMessage('No connection could be found. Please try again later.');
                    return;
                }

                var messageCode = data.meta.code;
                if (messageCode === 200) {

                    // extract venue items from result
                    var items = data.response.groups[0].items;
                    if (items.length == 0) {
                        self.setAlertMessage('No results found for   "'+ self.listPanel.searchBar() + '"');
                        self.startAlertMessage(true);
                        return;
                    }

                    var requestCount = items.length;
                    // keep track of when all results have been received
                    // so we can call a final fitBounds on the map
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
                                        this.containsPano(true);
                                    }
                                }.bind(marker));
                                bounds.extend(marker.googleMarker.getPosition());
                            } else {
                                // Alert the user of request failed
                                self.startAlertMessage(true);
                                self.setAlertMessage('One or more items failed to load.');
                            }

                            // set fitBounds every 10 markers
                            if (++count % 10 == 0) {
                                self.googleMap.fitBounds(bounds);
                            }
                            if (count == requestCount) {
                                self.googleMap.fitBounds(bounds);// Update map bounds again after retreiving all the markers
                                self.currentBounds = bounds; // save current bounds (reused when if window resizes)
                            }
                        });

                    }


                } else if(messageCode === 500) { // Alert the user using a custom message

                    self.setAlertMessage("Foursquare’s servers are unhappy. Please try again.");
                    self.startAlertMessage(true);
                } else { // alert the user using Foursquare's errorDetail message
                    self.setAlertMessage(data.meta.errorDetail);
                    self.startAlertMessage(true);
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
         * else close previous marker and make the clicked marker the new active marker
         * @param marker - the clicked marker
         */
        self.setActiveMarker = function (marker) {

            // If this is a mobile device or autoClose is checked, close the list panel
            if (self.listPanel.isVisible()) {
                if (!self.isDesktopMode() || self.listPanel.autoClose()) {
                    self.listPanel.isVisible(false);
                }
            }
            // if they're the same close infoWindow and set active marker to null
            if (self.activeMarker() === marker) {
                marker.closeInfoWindow();
                if (!self.isResizing)
                    self.activeMarker(null);
            } else {

                if (self.activeMarker() != null) // close previous active marker
                    self.activeMarker().closeInfoWindow();

                self.activeMarker(marker); // set new active marker

                // open marker's infoWindow and center it on map
                marker.openInfoWindow();
                marker.updateZIndex();
                self.centerOnMarker(marker.googleMarker.getPosition());

                // set a closer zoom for mobile devices
                if (!self.isDesktopMode()) {
                    self.googleMap.setZoom(17);
                }
            }

        };

        /**
         * Removes the attached markers
         *
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
            if (self.currentBounds && self.activeMarker() === null) {
                self.googleMap.fitBounds(self.currentBounds);
            }
            self.googleMap.setCenter(center);
        });

        // When isDesktopMode == false, a modal will be used to display the info window
        self.isDesktopMode = ko.observable(window.matchMedia("screen and (min-width: 769px)").matches);

        // Used for Indicating if the browser is beign resized
        self.isResizing = false;
        // Change infoWindow to display as a modal or google's infoWindow depending on the browser's width
        window.addEventListener('resize', function () {

            // get browser current mode using media query to gaurantee precision
            var mql = window.matchMedia("screen and (min-width: 769px)");
            var displayMode = mql.matches;

            // Only update infowindow when needed
            if (displayMode !== self.isDesktopMode()) {
                self.isDesktopMode(displayMode);
                self.isResizing = true;
                var marker = self.activeMarker();
                if (marker !== null) {
                    // reset (modal/google info window)
                    marker.closeInfoWindow();
                    marker.openInfoWindow();
                }
                self.isResizing = false;
            }

        }, false);

        if (bowser.msie) {
            self.setAlertMessage(
                "It looks like you're using Internet Explore! You may continue to use this " +
                "application but I would advise on getting a new browser. ;)");
            self.startAlertMessage(true);
        }

    };

    // Create a mapViewModel
    var mapViewModel = new MapViewModel(mapConfig);
    ko.applyBindings(mapViewModel);

    // Make initial query
    mapViewModel.searchQuery(mapConfig.explore);
}

$(document).ready(function() {

    // Check if google map had been initialized
    if (typeof google === 'object' && typeof google.maps === 'object') {
        initialize();
    } else {
        // Notify the user that google maps failed to load
        $('.alert-message').html('Failed to load google maps! Please try again by refreshing the page.');
        $('#alertModal').modal('show');

        $('#listPanel').css('display', 'none');
        // Auto reload page when user closes modal
        $('#alertModal').on('hide.bs.modal', function () {
            location.reload();
        });

    }
});