goog.provide('ome.ol3.interaction.Select');

goog.require('ol.interaction.Interaction')
goog.require('ol.Overlay')
goog.require('ol.Collection')

/**
 * @classdesc
 * Implements a leaner version of the standard open layers select without an extra
 * layer
 *
 * @constructor
 * @extends {ol.interaction.Interaction}
 * @param {ome.ol3.source.Regions} regions_reference a reference to Regions
 */
ome.ol3.interaction.Select = function(regions_reference) {
	// we do need the regions reference to get the (selected) rois
    if (!(regions_reference instanceof ome.ol3.source.Regions))
        console.error("Select needs Regions instance!");

	/**
	 * a reference to the Regions instance
   * @private
   * @type {ome.ol3.source.Regions}
   */
  this.regions_ = regions_reference;

	// call super
	goog.base(this, {});
	this.handleEvent = ome.ol3.interaction.Select.handleEvent;

	/**
	 * use different condition for clustered view
	 * @private
	 * @type {ol.events.ConditionType}
	 */
	this.condition_ =  function(mapBrowserEvent) {
		return ol.events.condition.click.call(
			regions_reference.select_, mapBrowserEvent);
	};

	/**
	 * this is where the selected features go
   * @private
   * @type {ol.Collection}
   */
	this.features_ = new ol.Collection();

	/**
	 * the flag whether the right click context menu should be enabled
   * @private
   * @type {boolean}
   */
	this.enableContextMenu_ = false;

	/**
	 * the overlay for the context menu
   * @private
   * @type {ol.Overlay}
   */
	this.contextMenuOverlay_ = null;

	// we only want it to apply to our layer
	var regionsLayer = this.regions_.viewer_.getRegionsLayer();
	/**
	 * @private
	 * @type {ol.interaction.SelectFilterFunction}
	 */
	this.layerFilter_ = function(layer) {
		return ol.array.includes([regionsLayer], layer);
	}

	/**
	 * @private
	 * @type {ol.interaction.SelectFilterFunction}
	 */
	this.filter_ = ol.functions.TRUE;

	if (this.enableContextMenu_)
		ome.ol3.interaction.Select.prototype.enableContextMenu.call(
			this, true);

    var config_id = this.regions_.viewer_.getTargetId();
    var propagateSelectionEvent = function(event) {
        if (this.regions_ === null) return;
        var eventbus = this.regions_.viewer_.eventbus_;
        setTimeout(function() {
            if (eventbus)
                eventbus.publish(
                    "REGIONS_PROPERTY_CHANGED",
                    { "config_id": config_id ,
                        "shapes": [event.element.getId()],
                        "property" : "selected",
                        "value" : event.type === "add"});
        },25);
    }.bind(this);

    /**
     * an add listener for propagating select events to the outside
     * only active if we have an eventbus registered
	 * @private
	 * @type {function}
	 */
	this.addListener_ =
        this.regions_.viewer_.eventbus_ ?
            ol.events.listen(
            this.features_, ol.Collection.EventType.ADD,
            propagateSelectionEvent) : null;

    /**
     * a remove listener for propagating select events to the outside
     * only active if we have an eventbus registered
	 * @private
	 * @type {function}
	 */
	this.removeListener_ =
        this.regions_.viewer_.eventbus_ ?
            ol.events.listen(
            this.features_, ol.Collection.EventType.REMOVE,
            propagateSelectionEvent) : null;
};
goog.inherits(ome.ol3.interaction.Select, ol.interaction.Interaction);

/**
 * Clears/unselects all selected features
 *
 */
ome.ol3.interaction.Select.prototype.clearSelection = function() {
	this.getFeatures().forEach(
		function(feature) {
			feature['selected'] = false;
	}, this);
	this.getFeatures().clear();
	this.regions_.changed();
}

/**
 * Handles a context menu for the selected feature
 *
 * @param {Object} event the event information
 */
ome.ol3.interaction.Select.prototype.handleRightClick = function(event) {

	var position = [event.offsetX,event.offsetY];
    var coord = this.viewer_.viewer_.getCoordinateFromPixel(position);
    var selected = this.select_.featuresAtCoords_(coord);

	this.select_.showContextMenu(position, selected);
};

/**
 * Handles the {@link ol.MapBrowserEvent map browser event} and may change the
 * selected state of features.
 * @param {ol.MapBrowserEvent} mapBrowserEvent Map browser event.
 * @return {boolean} `false` to stop event propagation.
 * @this {ol.interaction.Select}
 * @api
 */
ome.ol3.interaction.Select.handleEvent = function(mapBrowserEvent) {
  if (!this.condition_(mapBrowserEvent) || mapBrowserEvent.dragging) {
    return true;
  }

	// short circuit right for click context menu
	if (mapBrowserEvent instanceof ol.MapBrowserPointerEvent &&
			mapBrowserEvent.originalEvent instanceof MouseEvent &&
				typeof(mapBrowserEvent.originalEvent.which) === 'number' &&
				mapBrowserEvent.originalEvent.which === 3)
		return true;

	var selected = this.featuresAtCoords_(mapBrowserEvent.coordinate);

	var oldSelectedFlag =
        selected && typeof selected['selected'] === 'boolean' ?
         selected['selected'] : false;
	if (selected === null || !ol.events.condition.shiftKeyOnly(mapBrowserEvent)) {
		this.clearSelection();
		if (selected === null) return;
	}

	if (oldSelectedFlag) {
		selected['selected'] = false;
		this.getFeatures().remove(selected);
	} else {
		selected['selected'] = true;
		this.getFeatures().push(selected);
	}
	// we don't allow features and their associated clusters to be select at the same
	// time. this would not work well and we can do entire cluster operations
	// in a different way anyhow
	if (!(selected instanceof ome.ol3.feature.Cluster) &&
				selected['cluster'] instanceof ome.ol3.feature.Cluster) {
		selected['cluster']['selected'] = false;
		selected['cluster']['group_selected'] = false;
		this.getFeatures().remove(selected['cluster']);
	}
	this.regions_.changed();

	return ol.events.condition.pointerMove(mapBrowserEvent);
};

/**
 * Tests to see if the given coordinates intersects any of our features.
 * @param {ol.Coordinate} coord coordinate to test for intersection.
 * @return {ol.Feature} Returns the feature found at the specified pixel
 * coordinates.
 * @private
 */
ome.ol3.interaction.Select.prototype.featuresAtCoords_ = function(coord) {
    if (!ome.ol3.utils.Misc.isArray(coord) || coord.length !== 2) return;

    var extent = [coord[0]-2, coord[1]-2, coord[0]+2, coord[1]+2];
    var hits = [];
    if (this.regions_.useClusteredCollection_) // clustered mode hit detection
        this.regions_.clusteredRTrees_[this.regions_.currentRTreeLevel_].
            forEachInExtent(
                extent,
    		    function(feature) {
                    if (feature.getGeometry() &&
                        (typeof feature['visible'] !== 'boolean' || feature['visible']) &&
                            (typeof feature['state'] !== 'number' ||
                                feature['state'] !== ome.ol3.REGIONS_STATE.REMOVED) &&
    					        feature.getGeometry().intersectsExtent(extent))
    						hits.push(feature);});
    else this.regions_.forEachFeatureInExtent(
            extent, function(feat) {hits.push(feat);});
    //hits = this.regions_.forEachFeatureInExtent(extent); // unclustered

    return ome.ol3.utils.Misc.featuresAtCoords(
        hits, this.regions_.useClusteredCollection_);
};

/**
 * @param {Array.<number>} position an array of pixelcoordinates, e.g. [x,y]
 * @param {ol.Feature=} feature the context menu for the feature
 * @private
 */
ome.ol3.interaction.Select.prototype.showContextMenu =
	function(position, feature) {
	if (!ome.ol3.utils.Misc.isArray(position) || position.length !== 2 ||
				!(feature instanceof ol.Feature) ||
				!(this.contextMenuOverlay_ instanceof ol.Overlay))
		return;
	var contextFeature = feature || null;

	var contextMenu = document.createElement('div');
    contextMenu.id = 'ome_context_menu';
	if (contextMenu === null) return;

	// convert pixel to coordinates
	var coordinates =
		this.regions_.viewer_.viewer_.getCoordinateFromPixel(
			[position[0]-10, position[1]-10]);

	// for closing the context menu
	var overlayCaptured = this.contextMenuOverlay_;
	var closeContextMenuHandler = function(event) {
		overlayCaptured.setPosition(undefined);
		return false;
	}

	// add header with selected information
	var title = document.createElement('span');
    title.className = "context-title";
    title.textContent =
			feature instanceof ome.ol3.feature.Cluster ?
				"Cluster: " + feature.features_.length :
				"Feature: " + feature.getId();

	var close = document.createElement('a');
    close.href = "#";
    close.className = "context-close";
    close.textContent = "✖";
	close.onclick = closeContextMenuHandler;

	var header = document.createElement('div');
    header.className = "context-header";
    header.appendChild(title);
    header.appendChild(close);

    contextMenu.appendChild(header);

	// add select action for feature
	if (feature  instanceof ome.ol3.feature.Cluster)
		this.addItemToContextMenu(
			contextMenu, "Toggle Cluster Selection",
			function(event) {
				if (!(feature instanceof ome.ol3.feature.Cluster))
					return;

				var groupSelectState = typeof(feature['group_selected']) === 'boolean' ?
				 	feature['group_selected'] : false;

				var toggledState = groupSelectState === true ? false : true;
				feature['group_selected'] = toggledState;

				feature['selected'] = false;
				this.regions_.select_.getFeatures().remove(feature);

				for (var f in feature.features_) {
					feature.features_[f]['selected'] = toggledState;
					if (toggledState) {
						// first line makes sure we are not added twice
						this.regions_.select_.getFeatures().remove(feature.features_[f]);
						this.regions_.select_.getFeatures().push(feature.features_[f]);
					} else
						this.regions_.select_.getFeatures().remove(feature.features_[f]);
					this.regions_.changed();
				}
			}
		);
	else {
		this.addItemToContextMenu(
			contextMenu, "Toggle Shape Selection",
			function(event) {
				if (feature instanceof ome.ol3.feature.Cluster)
					return;
                this.regions_.setProperty(
                    [feature.getId()], "selected", !feature['selected']);});
        this.addItemToContextMenu(
			contextMenu, "Delete Shape",
			function(event) {
                if (feature instanceof ome.ol3.feature.Cluster)
					return;
                this.regions_.setProperty(
                    [feature.getId()], "state", ome.ol3.REGIONS_STATE.REMOVED);});
    }

	this.contextMenuOverlay_.setElement(contextMenu);
	this.contextMenuOverlay_.setPosition(coordinates);
	contextMenu.parentNode.style.margin="1px";
	this.regions_.viewer_.viewer_.getTargetElement().onmouseover =
		function(event) {
			if (event.target.id !== 'ome_context_menu' &&
					event.target.parentNode.id !== 'ome_context_menu' &&
					event.target.parentNode.parentNode.id !== 'ome_context_menu')
					overlayCaptured.setPosition(undefined);
					return false;
	};
};

/**
 * @param {Object} contextMenu the context menue dom element
 * @param {string} text the new items text description
 * @param {function=} handler a click handler to be executed
 * @private
 */
ome.ol3.interaction.Select.prototype.addItemToContextMenu =
 	function(contextMenu, text, handler) {
	if (typeof(contextMenu) !== 'object' ||
			typeof(text) !== 'string' || text.length === 0) return;
	var clickHandler = typeof(handler) === 'function' ? handler : null;

	var contentDiv = null;
	if (contextMenu.childNodes < 1 ||
		contextMenu.childNodes[contextMenu.childNodes.length-1].tagName.toUpperCase() !== 'DIV' ||
		!ome.ol3.utils.Misc.containsClass(contextMenu.childNodes[contextMenu.childNodes.length-1], "content")) {
            contextMenu.appendChild(document.createElement("hr"));
            var tmp = document.createElement("div");
            tmp.className = "context-content";
            contextMenu.appendChild(tmp);
	}
	contentDiv = contextMenu.childNodes[contextMenu.childNodes.length-1];
	if (contentDiv === null) return;
    if (contentDiv.childNodes.length >  0)
        contentDiv.appendChild(document.createElement("br"));
	var newItem = document.createElement("span");
	newItem.textContent = text;
	// register select style
	newItem.onmouseover = function(event) {
		ome.ol3.utils.Misc.setClass(event.target, "context-selected");
	};
	newItem.onmouseout = function(event) {
		ome.ol3.utils.Misc.setClass(event.target, "");
	};
	if (clickHandler) {
		var capturedThis = this;
		newItem.onclick = function(event) {
			handler.call(capturedThis, event);
		}
	};
	contentDiv.appendChild(newItem);
}

/**
 * Getter for the selected features
 *
 * @return {ol.Collection} the selected features
 */
ome.ol3.interaction.Select.prototype.getFeatures = function() {
	return this.features_;
}

/**
 * Enables/Disables context menu
 *
 * @param {boolean} flag if true, the right-click context menu is enabled, otherwise not
 */
ome.ol3.interaction.Select.prototype.enableContextMenu = function(flag) {
	if (typeof(flag) !== 'boolean')
		flag = false;

	var oldFlag = this.enableContextMenu_;
	if (oldFlag == flag) // no changes
		return;

	this.enableContextMenu_ = flag;
	if (flag) {
		// create and add overlay
		this.contextMenuOverlay_ = new ol.Overlay({autoPan: true});
		this.regions_.viewer_.viewer_.addOverlay(this.contextMenuOverlay_);

		var regions_reference = this.regions_;

		// add right click handler
		this.regions_.viewer_.viewer_.getTargetElement().oncontextmenu =
			function(event) {
				// we need a select to be present
				if (regions_reference.select_ === null)
					return;

				// delegate
				ome.ol3.interaction.Select.prototype.handleRightClick.call(
					regions_reference, event);

				// stop browser from showing you its context menu
				if (event.stopPropagation)
					event.stopPropagation();
				else
				event.cancelBubble = true;
				return false;
		}
	} else {
		if (this.contextMenuOverlay_ instanceof ol.Overlay) {
			this.regions_.viewer_.viewer_.removeOverlay(this.contextMenuOverlay_);
			this.contextMenuOverlay_ = null;
		}

        if (this.regions_.viewer_.viewer_.getTargetElement()) {
		    this.regions_.viewer_.viewer_.getTargetElement().oncontextmenu = null;
		    this.regions_.viewer_.viewer_.getTargetElement().onmouseover = null;
        }
	}
}

/**
 * a sort of desctructor
 */
ome.ol3.interaction.Select.prototype.disposeInternal = function() {
    if (this.addListener_) {
        ol.events.unlistenByKey(this.addListener_);
        this.addListener_ = null;
    }
    if (this.removeListener_) {
        ol.events.unlistenByKey(this.removeListener_);
        this.removeListener_ = null;
    }

	this.enableContextMenu(false);
	this.regions_ = null;
}