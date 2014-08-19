/**
 * Most of the code is stolen from https://github.com/fatiherikli/backbone-autocomplete
 *
 * and adapted to be used with wp.com rest api
 */
var Post = Backbone.Model.extend({
    label: function () {
        return this.get("title");
    },
    // url has no protocol so we need to add it
    permalink: function() {
    	var link;
    	// Workaround for rest api not returning proper permalinks for custom post types
    	// This is for specific use case
    	switch ( this.get('post_type') ) {
    		case 'post':
    			link = this.get('url');
    		break;
    		// Get base domain, append with post_type and slug
    		default:
    			link = this.get('url').split( '?' )[0] + this.get('post_type') + '/' + this.get('slug');
    		break;
    	}
    	//return link;
      return 'http://' + link + '/';
    },
    /**
     * We don't need scores from ES, just the fields themselves
     *
     * @param  {[type]} response [description]
     * @param  {[type]} options  [description]
     * @return {[type]}          [description]
     */
    parse: function( response, options ) {
        return response.fields;
    }
});

var PostCollection = Backbone.Collection.extend({
    model: Post,
    // Full URL to search endpoint
    url: "http://public-api.wordpress.com/rest/v1/sites/1821682/search",
    /**
     * By default backbone assumes that response is a collection
     * But we don't need anything except response.results.hits
     * @param  {[type]} response [description]
     * @param  {[type]} options  [description]
     * @return {[type]}          [description]
     */
    parse: function( response, options ) {
        return response.results.hits;
    },

    /**
     * Set basic collection properties if passed on instatiation
     * @param  object options [description]
     * @return {[type]}         [description]
     */
		initialize: function(options) {
			_.extend(this, options);
		},
});

var AutoCompleteItemView = Backbone.View.extend({
	tagName: "li",
	template: '<a href="<%- permalink %>"><%- label %></a>',

	events: {
		"click": "select"
	},

	initialize: function(options) {
		this.options = options;
	},

	render: function () {
		this.$el.html(_.template(this.template, {
			"label": this.model.label(),
			'permalink': this.model.permalink()
		}));
		return this;
	},

	select: function () {
		this.options.parent.hide().select(this.model);
		return false;
	}

});

var AutoCompleteView = Backbone.View.extend({
	tagName: "ul",
	itemView: AutoCompleteItemView,
	className: "autocomplete",
	allResults: jQuery('#all-search-results'),
	// Existing element in DOM to put the view in
	wrapperEl: jQuery("#search-results"),

	wait: 300,
	minKeywordLength: 2,
	currentText: "",

	initialize: function (options) {
		_.extend(this, options);
		this.filter = _.debounce(this.filter, this.wait);
	},

	render: function () {
		// disable the native auto complete functionality
		this.input.attr("autocomplete", "off");

		this.input
			.keyup(this.keyup.bind(this))
			.keydown(this.keydown.bind(this));
		// render the view
		this.wrapperEl.html( this.$el );
		return this;
	},

	keydown: function () {
		if (event.keyCode == 38) return this.move(-1);
		if (event.keyCode == 40) return this.move(+1);
		if (event.keyCode == 13) return this.onEnter();
		// ESC - hide the element and the wrapper, clear the input value
		if (event.keyCode == 27) { this.input.val(''); return this.hide() };
	},

	keyup: function () {
		var keyword = this.input.val();
		if (this.isChanged(keyword)) {
			if (this.isValid(keyword)) {
				this.filter(keyword);
			} else {
				this.hide()
			}
		}
	},

	filter: function (keyword) {
		if (this.model.url ) {
			/**
			 * Hardcoded ES query for now
			 * @type {[type]}
			 */
			var parameters =
				{
				   "size":20,
				   "filter":{
					  "and":[
						 {
							"terms":{
								 // Post types to include
							   "post_type":[
								  "post",
							   ]
							}
						 }
					  ]
				   },
				   "query":{
					  "multi_match":{
						 "query": keyword,
						 "fields":[
						  // Some fields are boosted
							"title^5",
							"content",
							"author",
							"tag",
							"category",
							"tag.name^3"
						 ],
						 "operator":"and",
						 "type":"cross_fields"
					  }
				   },
				   // Sort order
				   "sort":[
					  {
						 "_score":{
							"order":"desc"
						 },
						 "date": { "order": "desc" },
					  }
				   ],
				   "fields":[
					  "blog_id",
					  "post_id",
					  "url",
					  "title",
					  "post_type",
					  "slug"
				   ]
				}
			;
			// Fetch collection (make a POST request to search endpoint of wp.com REST API)
			this.model.fetch({
				success: function ( model, response, options ) {
					this.loadResult(this.model.models, keyword);
				}.bind(this),
				data: parameters,
				type: 'POST'
			});
		}
	},

	isValid: function (keyword) {
		return keyword.length > this.minKeywordLength
	},

	isChanged: function (keyword) {
		return this.currentText != keyword;
	},

	move: function (position) {
		var current = this.$el.children(".active"),
			siblings = this.$el.children(),
			index = current.index() + position;
		if (siblings.eq(index).length) {
			current.removeClass("active");
			siblings.eq(index).addClass("active");
		}
		return false;
	},

	onEnter: function () {
		this.$el.children(".active").click();
		return false;
	},

	loadResult: function (model, keyword) {
		this.currentText = keyword;
		this.show().reset();
		if (model.length) {
			_.forEach(model, this.addItem, this);
			this.show();
		} else {
			this.hide();
		}
	},

	addItem: function (model) {
		this.$el.append(new this.itemView({
			model: model,
			parent: this
		}).render().$el);
	},

	select: function (model) {
		var label = model.label();
		this.input.val(label);
		this.currentText = label;
		this.onSelect(model);
	},

	reset: function () {
		this.$el.empty();
		return this;
	},

	hide: function () {
		this.$el.hide();
		return this;
	},

	show: function () {
		this.$el.show();
		return this;
	},

	// callback definitions
	onSelect: function () {
		// noop
	}
});