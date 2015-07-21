/**
*
*   ModelViewForm.js
*   Declarative MV Form building, rendering, validation 
*   @dependencies: jQuery, ModelView
*   @version: 0.6
*
*   https://github.com/foo123/modelview.js
*   https://github.com/foo123/modelview-form.js
*
**/
!function( window, $, ModelView, undef ) {
"use strict";

// auxilliaries
var Extend = Object.create, PROTO = 'prototype', HAS = 'hasOwnProperty', 
    UPPER = 'toUpperCase', LOWER = 'toLowerCase', KEYS = Object.keys,
    toJSON = JSON.stringify, toString = Object[PROTO].toString,
    is_obj = function( o ){ return o instanceof Object || '[object Object]' === toString.call(o); },
    empty_brackets_re = /\[\s*\]$/, trim_re = /^\s+|\s+$/g, numeric_re = /^\d+$/,
    index_to_prop_re = /\[([^\]]*)\]/g, trailing_dots_re = /^\.+|\.+$/g,
    trim = String[PROTO].trim 
            ? function( s ){ return s.trim( ); } 
            : function( s ){ return s.replace(trim_re, ''); },
    uuid = ModelView.UUID, 
    TypeCast = ModelView.Type.Cast, 
    Validate = ModelView.Validation.Validate,
    Model = ModelView.Model, View, ModelViewForm
;

function dotted( key ) 
{
    //          convert indexes to properties   strip leading/trailing dots
    return key.replace(index_to_prop_re, '.$1').replace(trailing_dots_re, '');
}

function mvattr( key )
{
    return 'data-mvform-'+key;
}

function is_checked( i, c )
{
    return c.checked;
}

function get_value( c, i )
{
    var alternative;
    return c.checked
        ? c.value
        : (!!(alternative=c.getAttribute('data-else')) ? alternative : '')
    ;
}

function item_not_empty( o, i ) 
{ 
    return !!o && o.length; 
}

function update_options( $select, opts )
{
    opts = opts || [];
    var selected = $select.val( ), i, l, o, k, v,
        options = '', $group;
    for (i=0,l=opts.length; i<l; i++)
    {
        o = opts[ i ];
        if ( is_obj( o ) )
        {
            //k = KEYS( o )[ 0 ]; v = o[ k ];
            k = o.key; v = o.value;
        }
        else
        {
            k = o; v = o;
        }
        options += '<option value="' + k + '">' + v + '</option>';
    }
    $group = $select.children('optgroup');
    $group = $group.length ? $group.eq( 0 ) : $select;
    //$group.empty( );
    $group.children('option:not(.default)').remove( );
    $group.append( options );
    $select.val( selected ); // select the appropriate option
    return $select;
}

function ajax_dependent_select( $selects, model )
{
    var model_prefix = model.id + '.', 
        selects_exist = false, 
        dependent_selects = { };
        
    $selects.each(function( ){
        var $select = $(this), name = $select.attr('name'), key,
            ajax_model_key, ajax_key, ajax_options
        ;
        
        if ( !name ) return;
        
        key = dotted( name );
        if ( model_prefix !== key.slice(0, model_prefix.length) ) return;
        key = key.slice( model_prefix.length );
        
        ajax_options = $select.attr(mvattr( 'ajax-options' ));
        ajax_model_key = $select.attr(mvattr( 'key' )); 
        ajax_key = $select.attr(mvattr( 'ajax-key' ));
        if ( !ajax_key || !ajax_model_key || ! ajax_options ) return;
        
        dependent_selects[ ajax_model_key ] = {
            key: ajax_key,
            model_key: ajax_model_key,
            options: ajax_options,
            $el: $select
        };
        selects_exist = true;
    });
    
    if ( selects_exist )
    {
        model.on('change', function( evt, data ){
            var request, select;
            if ( !!data.key && dependent_selects[HAS]( data.key ) )
            {
                select = dependent_selects[ data.key ];
                request = {}; request[ select.key ] = model.get( select.model_key );
                select.$el.addClass('mvform-progress');
                ModelViewForm.doGET(select.options, request, function( success, response ){
                    update_options( select.$el, response || [] )
                        .removeClass('mvform-progress')
                        .trigger('change');
                });
            }
        });
        // trigger updates first time
        //model.notify( KEYS(dependent_selects), 'change' );
    }
    return KEYS(dependent_selects);
}

function fields2model( $elements, dataModel, locale )
{
    var model_prefix = dataModel.id + '.', checkboxes_done = { };
    $elements.each(function( ){
        var $el = $(this), name = $el.attr('name'), key,
            k, i, o, val, nval,
            validator, type, input_type, 
            required, data_required, required_validator,
            checkbox_type, is_dynamic_array = false, 
            alternative, has_alternative,
            checkboxes, params
        ;
        
        if ( !name || checkboxes_done[name] ) return;
        key = dotted( name );
        if ( model_prefix !== key.slice(0, model_prefix.length) ) return;
        key = key.slice( model_prefix.length );
        
        val = $el.val() || ''; nval = '';
        input_type = ($el.attr('type')||'')[LOWER]( );
        checkbox_type = ('radio' === input_type) || ('checkbox' === input_type);
        required = !!$el.attr('required');
        data_required = !!$el.attr(mvattr( 'required' ));
        alternative = $el.attr('data-else');
        has_alternative = !!alternative;
        is_dynamic_array = ('checkbox' === input_type) && empty_brackets_re.test( name );
        
        if ( !$el.attr("id") ) $el.attr( "id", uuid(key.split('.').join('_')) );
        
        if ( !!(type = $el.attr(mvattr( 'type' )) || input_type) ) 
        {
            type = type[UPPER]( );
            switch( type )
            {
                case "NUMBER": 
                case "INTEGER": 
                case "INT": 
                    dataModel.types[ key ] = TypeCast.INT; 
                    val = TypeCast.INT( val ) || 0; nval = 0;
                    if ( checkbox_type && !is_dynamic_array && has_alternative ) 
                        nval = TypeCast.INT( alternative ) || 0;
                    break;
                
                case "DATE": 
                case "TIME": 
                case "DATETIME": 
                case "EMAIL": 
                case "URL": 
                case "TEXT": 
                case "STRING": 
                case "STR": 
                    dataModel.types[ key ] = TypeCast.STR; 
                    val = TypeCast.STR( val ) || ''; nval = '';
                    if ( checkbox_type && !is_dynamic_array && has_alternative ) 
                        nval = TypeCast.STR( alternative ) || '';
                    break;
                
                case "BOOLEAN": 
                case "BOOL": 
                    dataModel.types[ key ] = TypeCast.BOOL; 
                    val = TypeCast.BOOL( val ) || false; nval = !val;
                    if ( checkbox_type && !is_dynamic_array && has_alternative ) 
                        nval = TypeCast.BOOL( alternative );
                    break;
                
                default: 
                    if ( TypeCast[HAS](type) ) 
                    {
                        dataModel.types[ key ] = TypeCast[ type ];
                        //val = TypeCast[ type ]( val );
                        if ( checkbox_type && !is_dynamic_array && has_alternative ) 
                            nval = TypeCast[ type ]( alternative );
                    }
            }
        }
        
        if ( !is_dynamic_array )
        {
            if ( !!(validator = $el.attr(mvattr( 'validate' ))) || required || data_required ||
                ('email'===input_type || 'url'===input_type || 
                'datetime' === input_type || 'date' === input_type || 'time' === input_type)
            ) 
            {
                if ( validator && Validate[HAS](validator=validator[UPPER]()) )
                {
                    if ( 'BETWEEN' === validator )
                    {
                        params = [parseInt($el.attr(mvattr( 'min' )),10), parseInt($el.attr(mvattr( 'max' )),10)];
                        if ( !isNaN(params[0]) && !isNaN(params[1]) )
                        {
                            dataModel.validators[ key ] = dataModel.validators[HAS]( key )
                                ? dataModel.validators[ key ].AND( Validate.BETWEEN(params[0], params[1], false) )
                                : Validate.BETWEEN(params[0], params[1], false)
                            ;
                        }
                    }
                    else if ( 'GREATER_THAN' === validator )
                    {
                        params = parseInt($el.attr(mvattr( 'min' )),10);
                        if ( !isNaN(params) )
                        {
                            dataModel.validators[ key ] = dataModel.validators[HAS]( key )
                                ? dataModel.validators[ key ].AND( Validate.GREATER_THAN(params, true) )
                                : Validate.GREATER_THAN(params, true)
                            ;
                        }
                    }
                    else if ( 'LESS_THAN' === validator )
                    {
                        params = parseInt($el.attr(mvattr( 'max' )),10);
                        if ( !isNaN(params) )
                        {
                            dataModel.validators[ key ] = dataModel.validators[HAS]( key )
                                ? dataModel.validators[ key ].AND( Validate.LESS_THAN(params, true) )
                                : Validate.LESS_THAN(params, true)
                            ;
                        }
                    }
                    else if ( 'DATETIME' === validator || 'DATE' === validator || 'TIME' === validator )
                    {
                        params = $el.attr(mvattr( 'format' )) || 'Y-m-d';
                        dataModel.validators[ key ] = dataModel.validators[HAS]( key )
                            ? dataModel.validators[ key ].AND( Validate.DATETIME(params, locale&&locale.datetime ? locale.datetime : null) )
                            : Validate.DATETIME(params, locale&&locale.datetime ? locale.datetime : null)
                        ;
                    }
                    else
                    {
                        dataModel.validators[ key ] = dataModel.validators[HAS]( key )
                            ? dataModel.validators[ key ].AND( Validate[ validator ] )
                            : Validate[ validator ]
                        ;
                    }
                }
                else if ( 'email' === input_type )
                {
                    dataModel.validators[ key ] = dataModel.validators[HAS]( key )
                        ? dataModel.validators[ key ].AND( Validate.EMAIL )
                        : Validate.EMAIL
                    ;
                }
                else if ( 'url' === input_type )
                {
                    dataModel.validators[ key ] = dataModel.validators[HAS]( key )
                        ? dataModel.validators[ key ].AND( Validate.URL )
                        : Validate.URL
                    ;
                }
                else if ( 'datetime' === input_type || 'date' === input_type || 'time' === input_type )
                {
                    params = $el.attr(mvattr( 'format' )) || 'Y-m-d';
                    dataModel.validators[ key ] = dataModel.validators[HAS]( key )
                        ? dataModel.validators[ key ].AND( Validate.DATETIME(params, locale&&locale.datetime ? locale.datetime : null) )
                        : Validate.DATETIME(params, locale&&locale.datetime ? locale.datetime : null)
                    ;
                }
                $el.attr(mvattr( 'bind' ), toJSON({error:"error", change:"change"}));
            }
        }
        if ( required || data_required )
        {
            required_validator = is_dynamic_array 
                ? Validate.MIN_ITEMS( parseInt($el.attr(mvattr( 'leastrequired' )), 10) || 1, item_not_empty )
                : Validate.NOT_EMPTY
            ;
                
            dataModel.validators[ key ] = dataModel.validators[HAS]( key )
                ? required_validator.AND( dataModel.validators[ key ] )
                : required_validator
            ;
            
            dataModel.validators[ key ].REQUIRED = 1;
            
            if ( required ) $el.removeAttr( 'required' );
            if ( !$el.attr(mvattr( 'bind' )) ) $el.attr(mvattr( 'bind' ), toJSON({error:"error", change:"change"}));
        }
        else if ( !is_dynamic_array && 
            ('function' === typeof dataModel.validators[ key ]) && 
            !dataModel.validators[ key ].REQUIRED 
        )
        {
            dataModel.validators[ key ] = Validate.EMPTY.OR( dataModel.validators[ key ] );
        }
        
        k = key.split('.'); o = dataModel.data;
        while ( k.length )
        {
            i = k.shift( );
            if ( k.length ) 
            {
                if ( !o[HAS]( i ) ) o[ i ] = numeric_re.test( k[0] ) ? [ ] : { };
                o = o[ i ];
            }
            else 
            {
                if ( !o[HAS]( i ) ) o[ i ] = is_dynamic_array ? [ ] : nval; // initialise the field
                
                if ( checkbox_type )
                {
                    if ( ('radio' === input_type) && $el.prop('checked') ) o[ i ] = val;
                    else if ( 'checkbox' === input_type ) 
                    {
                        checkboxes = $($el[0].form).find('input[type="checkbox"][name="'+name+'"]');
                        if ( is_dynamic_array )
                        {
                            o[ i ] = $.map(checkboxes.filter(is_checked), get_value);
                        }
                        else if ( checkboxes.length > 1 )
                        {
                            o[ i ] = $.map(checkboxes, get_value);
                        }
                        else if ( has_alternative )
                        {
                            o[ i ] = $el.prop('checked') ? val : nval;
                        }
                        else
                        {
                            o[ i ] = $el.prop('checked') ? val : nval;
                        }
                        checkboxes_done[name] = 1;
                    }
                }
                else
                {
                    o[ i ] = val;
                }
            }
        }
    });
}

// Custom Form View based on ModelView.View, implements custom form actions, can be overriden
View = function View( ) {
    var self = this;
    ModelView.View.apply(self, arguments);
};
View[PROTO] = Extend(ModelView.View[PROTO]);
View[PROTO].do_change = function( evt, el ) {
    var $el = $(el);
    if ( !el.validity.valid ) el.setCustomValidity("");
    if ( $el.hasClass('mvform-error') ) $el.removeClass('mvform-error');
};
View[PROTO].do_error = function( evt, el ) {
    var $el = $(el);
    if ( !el.validity.valid ) el.setCustomValidity("");
    if ( !$el.hasClass('mvform-error') ) $el.addClass('mvform-error');
};

// The main ModelViewForm Class
ModelViewForm = window.ModelViewForm = function ModelViewForm( options ) {
    var self = this;
    if ( !(self instanceof ModelViewForm) ) return new ModelViewForm( options );
    self.id = uuid('mvform');
    self.$pb = $({});
    self.$options = $.extend({
        submit: true,
        notify: true,
        model: false,
        livebind: false,
        prefixed: false,
        locale: { },
        Model: ModelViewForm.Model, 
        View: ModelViewForm.View,
        ajax: false
    }, options || { });
};
ModelViewForm.VERSION = "0.6"; 
ModelViewForm.Model = Model;
ModelViewForm.View = View;
ModelViewForm.doGET = function( url, data, cb ) {
    var handler = function( res, textStatus ) {
            if ( 'success' == textStatus ) cb( true, res );
            else cb( false, res );
    };
    $.ajax({
        type: 'GET',
        dataType: 'json',
        url: url,
        data: data || null,
        success: handler, error: handler
    });
};
ModelViewForm.doPOST = function( url, data, cb ) {
    var handler = function( res, textStatus ) {
            if ( 'success' == textStatus ) cb( true, res );
            else cb( false, res );
    };
    $.ajax({
        type: 'POST',
        dataType: 'json',
        url: url,
        data: data || null,
        success: handler, error: handler
    });
};
ModelViewForm.fields2model = fields2model;
ModelViewForm[PROTO] = {
    constructor: ModelViewForm,
    
    id: null,
    $pb: null,
    $form: null,
    $view: null,
    $messages: null,
    $options: null,
    
    dispose: function( ) {
        var self = this;
        self.$pb.off( );
        self.$pb = null;
        if ( self.$form /*&& self.$form.length*/ )
        {
            self.$form.off('submit.'+self.id);
            self.$form.modelview('dispose');
            self.$form.removeClass('mvform');
        }
        self.$form = null;
        self.$view = null;
        self.$messages = null;
        self.$options = null;
        self.id = null;
        return self;
    },
    
    trigger: function( evt, data, delay ) {
        var self = this, params = { };
        delay = delay || 0;
        params.data = data || null;
        params.mvform = self;
        if ( delay > 0 )
        {
            setTimeout(function( ){
                self.$pb.trigger( evt, params );
            }, delay);
        }
        else
        {
            self.$pb.trigger( evt, params );
        }
        return self;
    },
    
    on: function( evt, handler ) {
        var self = this;
        self.$pb.on( evt, handler );
        return self;
    },
    
    one: function( evt, handler ) {
        var self = this;
        self.$pb.one( evt, handler );
        return self;
    },
    
    off: function( evt ) {
        var self = this;
        if ( arguments.length > 1 ) self.$pb.off( evt, arguments[1] );
        else if ( evt ) self.$pb.off( evt );
        return self;
    },
    
    dom: function( el ) {
        var self = this;
        self.$form = $( el );
        self._render( );
        return self;
    },
   
    tpl: function( tpl, container ) {
        var self = this;
        self.$form = $( tpl.innerHTML ).appendTo( container );
        self._render( );
        return self;
    },
   
    serialize: function( ) {
        var self = this, data = { };
        data[self.$view.$model.id] = self.$view.$model.serialize( );
        return data;
    },
    
    validate: function( ) {
        var self = this, $form = self.$form, 
            options = self.$options || {}, validation;
        
        self.trigger('before-validate');
        
        validation = self.$view.$model.validate( );
        
        self.trigger('after-validate', validation);
        
        return validation;
    },
    
    notify: function( fields ) {
        var self = this, $form = self.$form, i, prefix, mverr, errors;
        if ( $form && $form.length && fields && fields.length )
        {
            self.$view.$model.notify( fields, 'error' );
            if ( self.$messages && self.$messages.length )
            {
                prefix = self.$options.prefixed 
                    ? self.$view.$model.id + '.'
                    : ''
                ;
                mverr = mvattr( 'error' ) + '="' + prefix;
                errors = '[' + mverr + fields.join('"],['+mverr) + '"]';
                self.$messages.hide( );
                $form.find( errors ).show( );
            }
        }
        return self;
    },
    
    _render: function( ) {
        var self = this, 
            
            options = self.$options || {},
            
            modelClass = options.Model || ModelViewForm.Model, 
            viewClass = options.View || ModelViewForm.View,
            
            $form = self.$form, model,
            
            dataModel = {
                id: options.model ? options.model : (!!(model=$form.attr(mvattr( 'model' ))) ? model : 'model'),
                data: { }, 
                types: { }, 
                validators: { }, 
                getters: { }, 
                setters: { },
                dependencies: { }
            },
            
            dependent_selects
        ;
        
        $form.addClass('mvform').attr('id', $form[0].id || uuid('mvform'));
        
        self.trigger('before-render');
        
        self.$messages = $form
                        .find('['+mvattr( 'error' )+']')
                        .hide( );
        
        // parse fields and build model
        fields2model( $form.find('input,textarea,select'), dataModel, options.locale );
        
        // form modelview
        $form.modelview({
            autoSync: false,
            autobind: true,
            livebind: options.livebind,
            isomorphic: false,
            autovalidate: false,
            bindAttribute: mvattr( 'bind' ),
            events: ['change','error','click'],
            model: dataModel,
            modelClass: modelClass,
            viewClass: viewClass
        });
        self.$view = $form.modelview('view');
        
        dependent_selects = ajax_dependent_select( $form.find('select['+mvattr( 'ajax-options' )+']'), self.$view.$model );
        
        if ( options.submit )
        {
            // handle form submission and validation
            $form.on('submit.'+self.id, function( evt ){
                var validation, request, 
                    options = self.$options;
                evt.preventDefault( );
                evt.stopPropagation( );
                self.$messages.hide( );
                
                validation = self.validate( );
                
                if ( !validation.isValid )
                {
                    if ( options.notify ) 
                        self.notify( validation.errors );
                }
                else if ( !!options.ajax )
                {
                    self.trigger('before-send', request = self.serialize( ));
                    
                    if ( request && !!options.ajax )
                    {
                        ModelViewForm.doPOST(options.ajax, request, function( success, response ){
                            
                            self.trigger('after-send', {success:success,response:response});
                        
                        });
                    }
                }
                else
                {
                    self.trigger('submit', self.serialize( ));
                }
                return false;
            });
        }
        
        $form.modelview('sync');
        if ( dependent_selects.length )
            // trigger updates first time
            self.$view.$model.notify( dependent_selects, 'change' );
        
        self.trigger('after-render');
        
        return self;
    }
};

}(window, jQuery, ModelView);