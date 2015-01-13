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
        locations: ["taco near Baton Rouge"]
    };

    var Marker = function (location) {

        var self = this;

        // objects that get attached to this marker
        self.attached = {
            map: null,
            infoWindow: null
        };

        self.id = 'marker-' + Marker.idNumber++;
        self.panoId = 'pano-' + self.id;
        self.foursquareId = 'foursquare-' + self.id;

        self.lat = location.geometry.location.lat();
        self.lng = location.geometry.location.lng();
        self.name = location.name;
        self.address = location.formatted_address;

        self.pano = ko.observable(null);
        self.foursquare = ko.observable(null);

        self.isFocus = ko.observable(false);
        self.isMouseOver = ko.observable(false);
        self.isWindowInfoOpen = ko.observable(false);

        // Update the marker's color when its state changes
        self.isMouseOver.subscribe(self.updateColor, self);
        self.isWindowInfoOpen.subscribe(self.updateColor, self);
        self.isFocus.subscribe(self.updateColor, self);

        // Create a google marker
        self.googleMarker = new google.maps.Marker({
            title: location.name,
            position: location.geometry.location,
            animation: google.maps.Animation.DROP
        });

        // Info window to display when the marker is clicked
        self.attached.infoWindow = new google.maps.InfoWindow();

        // Update infowindow when panoramo result is receieved
        self.pano.subscribe(self.loadInfoWindowContent, self);


        // Event listeners to update the marker's observables
        google.maps.event.addListener(self.googleMarker, 'click', self.click.bind(this));
        google.maps.event.addListener(self.googleMarker, 'mouseover', self.mouseover.bind(this));
        google.maps.event.addListener(self.googleMarker, 'mouseout', self.mouseout.bind(this));
        google.maps.event.addListener(self.attached.infoWindow, 'domready', self.onDOMInfoWindowReady.bind(this));


        google.maps.event.addListener(self.attached.infoWindow, 'closeclick', function() {
            // remove click listener from parent div
            //$('#' + self.id).parents()[3].onclick = null;
            self.isWindowInfoOpen(false);
        });

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
            this.attached.infoWindow.open(marker.getMap(), marker);
            this.loadInfoWindowContent();
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

    Marker.prototype.setMap = function (myMap) {
        this.attached.map = myMap;
        this.googleMarker.setMap(myMap.googleMap);
    };

    Marker.prototype.getInfoWindowcontent = function () {

        var content = $('#infoWindowTemplate').html();
        content = content.replace('{{id}}', this.id);
        content = content.replace('{{title}}', this.name);
        content = content.replace('{{address}}', this.address);
        content = content.replace('{{panoId}}', this.panoId);

        var panorama = this.pano() != null ? 'panorama' : 'no-panorama';

        var foursquare = '';
        var fourSquareContent = '';

        if (this.foursquare() != null) {
            foursquare = 'foursquare';
            fourSquareContent = '';
            console.log(this.foursquare());
        }

        content = content.replace('{{foursquare}}', foursquare);
        content = content.replace('{{foursquareContent}}', fourSquareContent);
        content = content.replace('{{panoramaClass}}', panorama);

        return content;
    };

    Marker.prototype.loadInfoWindowContent = function () {
        this.attached.infoWindow.setContent(this.getInfoWindowcontent());
    };


    /**
     * Sets a click listener to the third parent of infoWindow element.
     */
    Marker.prototype.onDOMInfoWindowReady = function () {

        // Get the pano div for this marker
        var panoDiv = document.getElementById(this.panoId);

        if (this.foursquare() != null) {

        }
        // Attach pano to infoWindow if marker has a pano
        if (this.pano() != null) {
            // Pano custom options
            var panoOptions = {
                navigationControl: true,
                enableCloseButton: false,
                addressControl: false,
                linksControl: false,
                pano: this.pano(),
                visible: true,
                navigationControlOptions: { style: google.maps.NavigationControlStyle.ANDROID }
            };
            // make pano expand to the edge of the infoWindow
            var container = $('#' + this.id).parents()[1];
            $(container).css("width", "100%");
            // add pano to infowindow
            var panorama = new google.maps.StreetViewPanorama(panoDiv, panoOptions);
        } else {
            //$(panoDiv).css("height", "100px")
            $(panoDiv).html('<p><strong>Street View data not found for this location.</strong></p>');
        }

    };

    var MapViewModal = function (mapConfig) {
        var self = this;

        // Create google map
        self.googleMap = new google.maps.Map(document.getElementById(mapConfig.canvasId), mapConfig.options);

        // Initialize google services
        self.placeService = new google.maps.places.PlacesService(self.googleMap);
        self.streetViewService = new google.maps.StreetViewService();

        // Initialize observable array to hold the map's markers
        self.markers = ko.observableArray([]);

        self.activeMarker = null;

        self.searchQuery = function (locations) {

            locations.forEach(function(location) {

                var request = {query: location};

                self.placeService.textSearch(request, function(result, status) {

                    if (status == google.maps.places.PlacesServiceStatus.OK) {

                        // Create markers from result and make panorama location
                        var i;
                        var bounds = new google.maps.LatLngBounds();

                        for(i = 0; i < result.length; i++) {
                            var marker = new Marker(result[i]);
                            var location = result[i].geometry.location;

                            self.streetViewService.getPanoramaByLocation(location, 60, function(data, panoStatus) {
                                // If location has a panorama
                                if (panoStatus == google.maps.StreetViewStatus.OK) {
                                    this.pano(data.location.pano); // attach pano to marker
                                }

                            }.bind(marker));

                            var url = [
                                "http://api.foursquare.com/v2/venues/search", // base url
                                "?client_id=DNHYJ5KY031FDOFXBAFROUXSDHJBLLFVKIBX5FVO10QWSU3J", // clientId
                                "&client_secret=TLJHOC3BO5LFV31JB3VTXTRGZYXWG5DJISR3M3STUXR14Q4J", // client secret
                                "&ll="+location.lat()+","+location.lng(), // latitude and longitude
                                "&query=" + result[i].name, // name to match
                                "&v=20140806", // version
                                "&m=foursquare", // mode
                            ];

                            // Make a ajax request to get the location VENUE_ID
                            $.ajax(url.join(''), {
                                dataType: 'json',
                                success: function(data) {

                                    if (data.response.venues.length == 0) {
                                        return;
                                    }

                                    // get venue_id
                                    var venue_id = data.response.venues[0].id;
                                    // create new query string
                                    var url = [
                                        "https://api.foursquare.com/v2/venues/",
                                        venue_id,
                                        "/?client_id=DNHYJ5KY031FDOFXBAFROUXSDHJBLLFVKIBX5FVO10QWSU3J&client_secret=TLJHOC3BO5LFV31JB3VTXTRGZYXWG5DJISR3M3STUXR14Q4J&v=20140806"
                                    ];

                                    // Use the VENUE_ID to get a more detailed info from location
                                    $.ajax(url.join(''), {
                                        dataType: 'json',
                                        success: function(data) {
                                            // Save venue details to this marker
                                            this.foursquare(data.response.venue);
                                        }.bind(this)
                                    });

                                }.bind(marker)
                            });

                            // extend bounds
                            bounds.extend(location);

                            // Add marker to observable array
                            self.markers.push(marker);
                        }

                        // fit map with the new bounds
                        self.googleMap.fitBounds(bounds);
                        self.attachMarkers();
                        self.currentBounds = bounds;
                    }
                });
            });

            // Attaches each marker with i * 100 delay, i = marker's array index
            self.attachMarkers = function () {
                for(var i = 0; i < self.markers().length; i++) {
                    setTimeout((function(index) {
                        return function () {
                            var marker = self.markers()[index];
                            marker.setMap(self);
                            marker.googleMarker.setZIndex(Marker.zIndex++);
                        };
                    })(i),i * 100);
                }
            };

        };

        // Centers map on marker
        self.centerOnMarker = function (marker) {
            self.googleMap.panTo(marker.googleMarker.getPosition());
            marker.isFocus(true);
        };

        self.setActiveMarker = function (marker) {
            if (self.activeMarker != null && self.activeMarker != marker) {
                self.activeMarker.closeInfoWindow();
            }
            if (marker.isWindowInfoOpen()) {
                marker.closeInfoWindow();
                self.activeMarker = null;
            } else {
                marker.focus();
                marker.openInfoWindow();
                self.activeMarker = marker;
            }
        };


        // Keeps map centered when being resized
        google.maps.event.addDomListener(window, 'resize', function() {
            var center = self.googleMap.getCenter();
            google.maps.event.trigger(self.googleMap, 'resize');
            //self.map.fitBounds(self.currentBounds);
            self.googleMap.setCenter(center);
        });


        // default search query when map is first initialized
        self.searchQuery(mapConfig.locations);


    };


    ko.applyBindings(new MapViewModal(mapConfig));
});