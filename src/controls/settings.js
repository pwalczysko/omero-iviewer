// js
import Context from '../app/context';
import {inject, customElement, bindable} from 'aurelia-framework';

import {
    IMAGE_CONFIG_UPDATE, IMAGE_MODEL_CHANGE, IMAGE_CHANNEL_RANGE_CHANGE,
    EventSubscriber
} from '../events/events';

/**
 * Represents the settings section in the right hand panel
 * @extends {EventSubscriber}
 */

@customElement('settings')
@inject(Context)
export default class Settings extends EventSubscriber {
    /**
     * which image config do we belong to (bound in template)
     * @memberof Settings
     * @type {number}
     */
    @bindable config_id = null;

    /**
     * a reference to the image info
     * @memberof Settings
     * @type {ImageInfo}
     */
    image_info = null;

    /**
     * events we subscribe to
     * @memberof Settings
     * @type {Array.<string,function>}
     */
    sub_list = [[IMAGE_CONFIG_UPDATE,
                    (params = {}) => this.onImageConfigChange(params)]];

    /**
     * @constructor
     * @param {Context} context the application context (injected)
     */
    constructor(context) {
        super(context.eventbus);
        this.context = context;
    }

    /**
     * Overridden aurelia lifecycle method:
     * called whenever the view is bound within aurelia
     * in other words an 'init' hook that happens before 'attached'
     *
     * @memberof Settings
     */
    bind() {
        this.subscribe();
    }

    /**
     * Handles changes of the associated ImageConfig
     *
     * @memberof Settings
     * @param {Object} params the event notification parameters
     */
     onImageConfigChange(params = {}) {
         // if the event is for another config, forget it...
         if (params.config_id !== this.config_id) return;

         // change image config and update image info
         this.config_id = params.config_id;
         this.image_info =
             this.context.getImageConfig(params.config_id).image_info;
     }

     /**
     * Grayscale flag toggler (event handler)
     *
     * @memberof Settings
     */
    toggleModel() {
        this.context.publish(
            IMAGE_MODEL_CHANGE,
            { config_id: this.config_id, model: this.image_info.model});
    }

    /**
    * Shows and hides the histogram
    *
    * @memberof Settings
    */
    toggleHistogram() {
        alert("Not implemented yet!");
    }

    /**
     * Overridden aurelia lifecycle method:
     * called whenever the view is unbound within aurelia
     * in other words a 'destruction' hook that happens after 'detached'
     *
     * @memberof Settings
     */
    unbind() {
        this.unsubscribe()
        this.image_info = null;
    }
}