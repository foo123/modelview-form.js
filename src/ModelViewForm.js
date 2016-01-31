/**
*
*   ModelViewForm.js
*   Declarative MV Form building, rendering, localisation, validation 
*   @dependencies: jQuery, ModelView, ModelViewValidation, Xpresion (optional, for custom field expressions)
*   @version: 1.0.0
*
*   https://github.com/foo123/modelview.js
*   https://github.com/foo123/modelview-form.js
*
**/
!function( window, $, ModelView, Xpresion, undef ) {
"use strict";
// auxilliaries
var Extend = Object.create, PROTO = 'prototype', HAS = 'hasOwnProperty', 
    UPPER = 'toUpperCase', LOWER = 'toLowerCase', KEYS = Object.keys, toString = Object[PROTO].toString,
    ATTR = 'getAttribute', SET_ATTR = 'setAttribute', HAS_ATTR = 'hasAttribute', DEL_ATTR = 'removeAttribute',
    
    json_encode = JSON.stringify, json_decode = JSON.parse,
    base64_decode = atob, base64_encode = btoa,
    url_encode = encodeURIComponent, url_decode = decodeURIComponent,
    
    is_obj = function( o ){ return '[object Object]' === toString.call(o); },
    is_array = function( o ) { return '[object Array]' === toString.call(o); },
    trim_re = /^\s+|\s+$/g,
    trim = String[PROTO].trim 
            ? function( s ){ return s.trim( ); } 
            : function( s ){ return s.replace(trim_re, ''); },
    numeric_re = /^\d+$/, index_to_prop_re = /\[([^\]]*)\]/g, dynamic_array_re = /\[\s*\]$/,
    leading_dots_re = /^\.+/g, trailing_dots_re = /^\.+|\.+$/g,
    dotted = function( key ) {
        //        convert indexes to properties     strip trailing dots
        return key.replace(index_to_prop_re, '.$1').replace(trailing_dots_re, '');
    },
    dotted2 = function( key ) {
        //        convert indexes to properties     strip leading dots
        return key.replace(index_to_prop_re, '.$1').replace(leading_dots_re, '');
    },
    escaped_re = /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, 
    esc_re = function( s ) { return s.replace(escaped_re, "\\$&"); },
    RE = function( re, fl ) { return new RegExp(re, fl||''); },
    TypeCast = ModelView.Type.Cast, Validate = ModelView.Validation.Validate,
    uuid = ModelView.UUID, Model = ModelView.Model, View, ModelViewForm
;


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
        : (!!(alternative=c[ATTR]('data-else')) ? alternative : '')
    ;
}

function item_not_empty( o, i ) 
{ 
    return !!o && o.length; 
}

function update_options( $select, opts )
{
    opts = opts || [];
    var selected, i, l, o, k, v,
        options = '', $group;
    
    // initial selections, before ajax options were loaded, stored in data- attributes
    if ( !!(selected=$select.attr( mvattr( 'selected-multiple' ) )) )
    {
        $select.removeAttr( mvattr( 'selected-multiple' ) );
        selected = selected.split(',');
    }
    else if ( !!(selected=$select.attr( mvattr( 'selected' ) )) )
    {
        $select.removeAttr( mvattr( 'selected' ) );
    }
    else
    {
        selected = $select.val( );
    }
    
    //$select.removeAttr( mvattr( 'selected' ) );
    //$select.removeAttr( mvattr( 'selected-multiple' ) );
    
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
    $group.children('option:not(.default,.placeholder)').remove( );
    $group.append( options );
    $select.val( selected ); // select the appropriate option
    return $select;
}

function ajax_dependent_select( $selects, mvform )
{
    var model = mvform.$view.$model, 
        model_prefix = model.id + '.', 
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
        if ( !ajax_key ) ajax_key = ajax_model_key;
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
                mvform.trigger( 'before-ajax-options', select );
                ModelViewForm.doGET(select.options, request, function( success, response ){
                    update_options( select.$el, response || [] )
                        .removeClass('mvform-progress')
                        .trigger('change');
                    mvform.trigger( 'after-ajax-options', select );
                });
            }
        });
        // trigger updates first time
        model.notify( KEYS(dependent_selects), 'change' );
    }
}

function key_getter( at_key, prefix )
{
    if ( "function" === typeof at_key ) return at_key;
    else if ( !!prefix )
    {
        // strict mode (after prefix, a key follows)
        var regex = RE( '^' + esc_re( prefix ) + '([\\.\\[].+)$' );
        return function( el ) { 
            var m, key = el[ATTR]( at_key );
            return !!key && (m=key.match(regex)) ? m[1] : null;
        };
    }
    else
    {
        return function( el ) {
            return el[ATTR]( at_key );
        };
    }
}

function value_getter( at_value, strict )
{
    return "function" === typeof at_value
        ? at_value
        : (false !== strict
        ? function( el ) {
            var value = ('value' === at_value ? $(el).val() : el[ATTR]( at_value )) || '',
                type = (el[ATTR]('type')||el.tagName||'').toLowerCase( );
            
            // empty, non-selected, non-checked element, bypass
            if ( 'file' === type )
            {
                // File or Blob object
                return !el.files.length ? null : el.files;
            }
            else
            {
                // empty, non-selected, non-checked element, bypass
                return ( (('checkbox' === type || 'radio' === type) && !el.checked) ||
                    ('select' === type && (!value.length || -1 === el.selectedIndex)) ||
                    (('text' === type || 'textarea' === type ) && !trim(value).length)
                ) ? undef : value;
            }
        }
        : function( el ) {
            var value = ('value' === at_value ? $(el).val() : el[ATTR]( at_value )) || '',
                type = (el[ATTR]('type')||el.tagName).toLowerCase( );
            // empty, non-selected, non-checked element, bypass
            if ( 'file' === type )
            {
                // File or Blob object
                return !el.files.length ? null : el.files;
            }
            else
            {
                return (('checkbox' === type || 'radio' === type) && !el.checked) ? undef : value;
            }
        });
}

function fields2model( $elements, model, locale, $key, $value/*, $json_encoded*/, arrays_as_objects )
{
    $key = key_getter( $key || 'name', model.id );
    $value = value_getter( $value || 'value', false );
    //if ( arguments.length < 6 ) $json_encoded = false;
    arrays_as_objects = true === arrays_as_objects;
    for (var e=0,len=$elements.length; e<len; e++)
    {
        var el = $elements[e], $el = $(el),
            name, value, key, key2, k, i, o, val, nval,
            validator, type, input_type, 
            required, data_required, required_validator,
            checkbox_type, file_type, is_dynamic_array = false, 
            alternative, has_alternative,
            checkboxes, params
        ;
        
        name = $key( el ); if ( !name ) continue;
        is_dynamic_array = dynamic_array_re.test( name );
        input_type = (el[ATTR]('type')||'')[LOWER]( );
        checkbox_type = ('radio' === input_type) || ('checkbox' === input_type);
        file_type = 'file' === input_type;
        has_alternative = el[HAS_ATTR]('data-else');
        alternative = has_alternative ? el[ATTR]('data-else') : null;
        value = $value( el );
        if ( null == value )
        {
            if ( file_type || (!is_dynamic_array && 'checkbox' === input_type && !el.checked && has_alternative) )
            {
                // pass
                value = null;
            }
            else
            {
                continue;
            }
        }
        /*if ( json_encoded )
        {
            if ( !!value ) value = json_decode( value );
            else value = null;
        }*/
        k = dotted2( name ); key = k.replace(trailing_dots_re, '');
        val = value || ''; nval = '';
        required = !!el[ATTR]('required');
        data_required = !!el[ATTR](mvattr( 'required' ));
        
        if ( !el[HAS_ATTR]("id") ) el[ATTR]( "id", uuid(key.split('.').join('_')) );
        
        if ( !!(type = el[ATTR](mvattr( 'type' )) || input_type) ) 
        {
            type = type[UPPER]( );
            switch( type )
            {
                case "NUMBER": 
                case "INTEGER": 
                case "INT": 
                    model.types[ key ] = TypeCast.INT; 
                    val = TypeCast.INT( val ) || 0; nval = 0;
                    if ( checkbox_type && !is_dynamic_array && has_alternative ) 
                        nval = TypeCast.INT( alternative ) || 0;
                    break;
                
                case "BOOLEAN": 
                case "BOOL": 
                    model.types[ key ] = TypeCast.BOOL; 
                    val = TypeCast.BOOL( val ) || false; nval = !val;
                    if ( checkbox_type && !is_dynamic_array && has_alternative ) 
                        nval = TypeCast.BOOL( alternative );
                    break;
                
                case "EMAIL": 
                case "URL": 
                case "TEXT": 
                case "STRING": 
                case "STR": 
                    model.types[ key ] = TypeCast.STR; 
                    val = TypeCast.STR( val ) || ''; nval = '';
                    if ( checkbox_type && !is_dynamic_array && has_alternative ) 
                        nval = TypeCast.STR( alternative ) || '';
                    break;
                
                default: 
                    if ( TypeCast[HAS](type) ) 
                    {
                        model.types[ key ] = TypeCast[ type ];
                        //val = TypeCast[ type ]( val );
                        if ( checkbox_type && !is_dynamic_array && has_alternative ) 
                            nval = TypeCast[ type ]( alternative );
                    }
            }
        }
        
        if ( !is_dynamic_array )
        {
            if ( !!(validator = el[ATTR](mvattr( 'validate' ))) || required || data_required ||
                ('email'===input_type || 'url'===input_type || 
                'datetime' === input_type || 'date' === input_type || 'time' === input_type)
            ) 
            {
                if ( !!validator /*&& Validate[HAS](validator=validator[UPPER]())*/ )
                {
                    validator = validator[UPPER]();
                    
                    if ( 'BETWEEN' === validator )
                    {
                        params = [parseInt(el[ATTR](mvattr( 'min' )),10), parseInt(el[ATTR](mvattr( 'max' )),10)];
                        if ( !isNaN(params[0]) && !isNaN(params[1]) )
                        {
                            model.validators[ key ] = model.validators[HAS]( key )
                                ? model.validators[ key ].AND( Validate.BETWEEN(params[0], params[1], false) )
                                : Validate.BETWEEN(params[0], params[1], false)
                            ;
                        }
                    }
                    else if ( 'GREATER_THAN' === validator )
                    {
                        params = parseInt(el[ATTR](mvattr( 'min' )),10);
                        if ( !isNaN(params) )
                        {
                            model.validators[ key ] = model.validators[HAS]( key )
                                ? model.validators[ key ].AND( Validate.GREATER_THAN(params, true) )
                                : Validate.GREATER_THAN(params, true)
                            ;
                        }
                    }
                    else if ( 'LESS_THAN' === validator )
                    {
                        params = parseInt(el[ATTR](mvattr( 'max' )),10);
                        if ( !isNaN(params) )
                        {
                            model.validators[ key ] = model.validators[HAS]( key )
                                ? model.validators[ key ].AND( Validate.LESS_THAN(params, true) )
                                : Validate.LESS_THAN(params, true)
                            ;
                        }
                    }
                    else if ( 'DATETIME' === validator || 'DATE' === validator || 'TIME' === validator )
                    {
                        params = el[ATTR](mvattr( 'format' )) || 'Y-m-d H:i:s';
                        model.validators[ key ] = model.validators[HAS]( key )
                            ? model.validators[ key ].AND( Validate.DATETIME(params, locale&&locale.datetime ? locale.datetime : null) )
                            : Validate.DATETIME(params, locale&&locale.datetime ? locale.datetime : null)
                        ;
                    }
                    else if ( 'FILESIZE' === validator )
                    {
                        params = parseInt(el[ATTR](mvattr( 'filesize' )), 10) || 1048576 /*1 MiB*/;
                        model.validators[ key ] = model.validators[HAS]( key )
                            ? model.validators[ key ].AND( Validate.FILESIZE(el, params) )
                            : Validate.FILESIZE(el, params)
                        ;
                    }
                    else if ( 'FILETYPE' === validator || 'FILEMIMETYPE' === validator)
                    {
                        params = el[ATTR](mvattr( 'filetype' ));
                        model.validators[ key ] = model.validators[HAS]( key )
                            ? model.validators[ key ].AND( Validate.FILETYPE(el, params) )
                            : Validate.FILETYPE(el, params)
                        ;
                    }
                    else if ( Validate[HAS](validator) )
                    {
                        model.validators[ key ] = model.validators[HAS]( key )
                            ? model.validators[ key ].AND( Validate[ validator ] )
                            : Validate[ validator ]
                        ;
                    }
                }
                else if ( 'email' === input_type )
                {
                    model.validators[ key ] = model.validators[HAS]( key )
                        ? model.validators[ key ].AND( Validate.EMAIL )
                        : Validate.EMAIL
                    ;
                }
                else if ( 'url' === input_type )
                {
                    model.validators[ key ] = model.validators[HAS]( key )
                        ? model.validators[ key ].AND( Validate.URL )
                        : Validate.URL
                    ;
                }
                else if ( 'datetime' === input_type || 'date' === input_type || 'time' === input_type )
                {
                    params = el[ATTR](mvattr( 'format' )) || 'Y-m-d H:i:s';
                    model.validators[ key ] = model.validators[HAS]( key )
                        ? model.validators[ key ].AND( Validate.DATETIME(params, locale&&locale.datetime ? locale.datetime : null) )
                        : Validate.DATETIME(params, locale&&locale.datetime ? locale.datetime : null)
                    ;
                }
                if ( !el[HAS_ATTR](mvattr( 'bind' )) )
                    el[SET_ATTR](mvattr( 'bind' ), json_encode({error:"error", change:"change"}));
            }
        }
        if ( required || data_required )
        {
            required_validator = is_dynamic_array 
                ? (file_type
                ? Validate.MIN_FILES( el, parseInt(el[ATTR](mvattr( 'leastrequired' )), 10) || 1 )
                : Validate.MIN_ITEMS( parseInt(el[ATTR](mvattr( 'leastrequired' )), 10) || 1, item_not_empty ))
                : (file_type
                ? Validate.MIN_FILES( el, 1 )
                : Validate.NOT_EMPTY)
            ;
                
            model.validators[ key ] = model.validators[HAS]( key )
                ? required_validator.AND( model.validators[ key ] )
                : required_validator
            ;
            
            model.validators[ key ].REQUIRED = 1;
            
            if ( required ) el[DEL_ATTR]( 'required' );
            if ( !el[HAS_ATTR](mvattr( 'bind' )) )
                el[SET_ATTR](mvattr( 'bind' ), json_encode({error:"error", change:"change"}));
        }
        else if ( !is_dynamic_array && 
            ('function' === typeof model.validators[ key ]) && 
            !model.validators[ key ].REQUIRED 
        )
        {
            model.validators[ key ] = Validate.EMPTY.OR( model.validators[ key ] );
        }
        
        k = k.split('.'); o = model.data;
        while ( k.length )
        {
            i = k.shift( );
            if ( k.length ) 
            {
                if ( !o[HAS]( i ) )
                {
                    if ( is_dynamic_array && 1 === k.length ) // dynamic array, ie a[ b ][ c ][ ]
                    {
                        if ( value instanceof FileList /*!!el.type && ('file' === el.type.toLowerCase())*/ )
                        {
                            // FileList is already array for file input fields
                            o[ i ] = val;
                            break;
                        }
                        else
                        {
                            o[ i ] = [ ];
                        }
                    }
                    else if ( !arrays_as_objects && numeric_re.test( k[0] ) ) // standard array, ie a[ b ][ c ][ n ]
                    {
                        o[ i ] = new Array( parseInt(k[0], 10)+1 );
                    }
                    else // object, associative array, ie a[ b ][ c ][ k ]
                    {
                        o[ i ] = { };
                    }
                }
                else if ( !arrays_as_objects && numeric_re.test( k[0] ) && (o[i].length <= (n=parseInt(k[0], 10))) )
                {
                    // adjust size if needed to already standard array
                    o[ i ] = o[ i ].concat( new Array(n-o[i].length+1) );
                }
                o = o[ i ];
            }
            else 
            {
                if ( is_dynamic_array ) o.push( val ); // dynamic array, i.e a[ b ][ c ][ ]
                else o[ i ] = !is_dynamic_array && 'checkbox' === input_type && !el.checked && has_alternative ? nval : val; // i.e a[ b ][ c ][ k ]
            }
        }
    }
}

function datauri2blob( dataURI, mimeType )
{
    // convert base64/URLEncoded data component to raw binary data held in a string
    var byteString, arrayBuffer, dataType, i, i0, n, j, p;
    if ( 'data:' === dataURI.substr( 0, 5 ) )
    {
        if ( -1 < (p=dataUri.indexOf(';base64,')) )
        {
            // separate out the mime component
            dataType = dataUri.slice( 5, p );
            dataUri = dataUri.slice( p+8 );
            byteString = base64_decode( dataUri );
        }
        else
        {
            // separate out the mime component
            dataType = dataUri.slice( 5, p=dataUri.indexOf(',') );
            dataUri = dataUri.slice( p+1 );
            byteString = unescape( dataURI );
        }
        if ( null == mimeType ) mimeType = dataType;
    }
    else
    {
        byteString = dataURI;
    }

    // write the bytes of the string to a typed array
    n = byteString.length;
    arrayBuffer = new Uint8Array( n );
    i0 = n & 15;
    for (i=0; i<i0; i++)
    {
        arrayBuffer[ i ] = byteString.charCodeAt( i ) & 0xFF;
    }
    for (i=i0; i<n; i+=16)
    {
        // loop unrolling, ~ 16 x faster
        j = i;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
        arrayBuffer[ j ] = byteString.charCodeAt( j++ ) & 0xFF;
    }
    return new Blob( [arrayBuffer], {type:mimeType} );
}

function params2model( q, model, coerce, arrays_as_objects )
{
    model = model || {}; coerce = !!coerce;
    arrays_as_objects = true === arrays_as_objects;
    var coerce_types = { 'true':true, 'false':false, 'null':null, 'undefined':undefined }, 
        params, p, key, value, o, k;

    // Iterate over all name=value pairs.
    params = q.replace(/%20|\+/g, ' ').split('&');
    for (i=0,l=params.length; i<l; i++)
    {
        p = params[i].split( '=' );
        // If key is more complex than 'foo', like 'a[]' or 'a[b][c]', split it
        // into its component parts.
        key = url_decode( p[0] );
        value = p.length > 1 ? url_decode( p[1] ) : (coerce ? undefined : '');
        // Coerce values.
        if ( coerce )
        {
            value = value && !isNaN(value) && ((+value + '') === value)
            ? +value                  // number
            : ('undefined' === typeof value
            ? undefined               // undefined
            : (coerce_types[HAS][value]
            ? coerce_types[value]     // true, false, null, undefined
            : value));                // string
        }
        
        var is_dynamic_array = dynamic_array_re.test( key );
        key = dotted2( key ).split('.'); o = model;
        while ( key.length )
        {
            k = key.shift( );
            if ( key.length ) 
            {
                if ( !o[HAS]( k ) )
                {
                    if ( is_dynamic_array && 1 === key.length ) // dynamic array, ie a[ b ][ c ][ ]
                        o[ k ] = [ ];
                    else if ( !arrays_as_objects && numeric_re.test( key[0] ) ) // standard array, ie a[ b ][ c ][ n ]
                        o[ k ] = new Array( parseInt(key[0], 10)+1 );
                    else // object, associative array, ie a[ b ][ c ][ k ]
                        o[ k ] = { };
                }
                else if ( !arrays_as_objects && numeric_re.test( key[0] ) && (o[k].length <= (n=parseInt(key[0], 10))) )
                {
                    // adjust size if needed to already standard array
                    o[ k ] = o[ k ].concat( new Array(n-o[k].length+1) );
                }
                o = o[ k ];
            }
            else 
            {
                if ( is_dynamic_array ) o.push( value ); // dynamic array, i.e a[ b ][ c ][ ]
                else o[ k ] = value; // i.e a[ b ][ c ][ k ]
            }
        }
    }
    return model;
}

function traverse( q, o, add, key )
{
    var k, i, l;

    if ( !!key )
    {
        
        if ( is_array( o ) )
        {
            if ( dynamic_array_re.test( key ) ) /* dynamic array */
                for (i=0,l=o.length; i<l; i++)
                    add( q, key, o[i] );
            else
                for (i=0,l=o.length; i<l; i++)
                    traverse( q, o[i], add, key + '[' + ('object' === typeof o[i] ? i : '') + ']' );
        }
        else if ( o instanceof FileList )
        {
            for (i=0,l=o.length; i<l; i++)
                add( q, key, o[i] );
        }
        else if ( o instanceof File || o instanceof Blob )
        {
                add( q, key, o );
        }
        else if ( o && ('object' === typeof o) )
        {
            for (k in o) if ( o[HAS](k) ) traverse( q, o[k], add, key + '[' + k + ']' );
        }
        else
        {
            add( q, key, o );
        }
    }
    else if ( is_array( o ) )
    {
        for (i=0,l=o.length; i<l; i++) add( q, o[i].name, o[i].value );
    }
    else if ( o instanceof FileList )
    {
        for (i=0,l=o.length; i<l; i++) add( q, key, o[i] );
    }
    else if ( o instanceof File || o instanceof Blob )
    {
            add( q, key, o );
    }
    else if ( o && ('object' === typeof o) )
    {
        for (k in o) if ( o[HAS](k) ) traverse( q, o[k], add, k );
    }
    return q;
}
// adapted from https://github.com/knowledgecode/jquery-param
function append_url( q, k, v )
{
    if ( 'function' === typeof v ) v = v( );
    if ( (v instanceof FileList) || (v instanceof File) || (v instanceof Blob) )
    {
        /* skip */
    }
    else
    {
        q.push( url_encode( k ) + '=' + url_encode( null == v ? '' : v ) );
    }
}
function model2params( model, q, raw )
{
    var params = traverse( q || [], model || {}, append_url );
    if ( true !== raw ) params = params.join('&').split('%20').join('+');
    return params;
}
function append_fd( fd, k, v )
{
    if ( 'function' === typeof v ) v = v( );
    if ( v instanceof FileList )
    {
        for (var i=0,l=v.length; i<l; i++)
            fd.append( k, v[i], v[i].name );
    }
    else if ( v instanceof File )
    {
        fd.append( k, v, v.name );
    }
    else
    {
        fd.append( k, null == v ? '' : v );
    }
}
function model2formdata( model, fd, formDataClass )
{
    if ( null == formDataClass && ('undefined' !== typeof FormData) ) formDataClass = FormData;
    return formDataClass && model instanceof formDataClass ? model : traverse( fd || new formDataClass( ), model || {}, append_fd );
}
function model2json( model )
{
    return json_encode( model || {} );
}

// Custom Form View based on ModelView.View, implements custom form actions, can be overriden
View = function View( ) {
    var self = this;
    ModelView.View.apply(self, arguments);
};
View[PROTO] = Extend(ModelView.View[PROTO]);
View[PROTO].do_change = function( evt, el ) {
    var $el = $(el), proxy_att = mvattr('proxy'), proxy = el[HAS_ATTR]( proxy_att ) && el[ATTR]( proxy_att );
    if ( !el.validity.valid ) el.setCustomValidity("");
    if ( $el.hasClass('mvform-error') ) $el.removeClass('mvform-error');
    if ( !!proxy ) $(proxy).removeClass('mvform-error');
};
View[PROTO].do_error = function( evt, el ) {
    var $el = $(el), proxy_att = mvattr('proxy'), proxy = el[HAS_ATTR]( proxy_att ) && el[ATTR]( proxy_att );
    if ( !el.validity.valid ) el.setCustomValidity("");
    if ( !$el.hasClass('mvform-error') ) $el.addClass('mvform-error');
    if ( !!proxy ) $(proxy).addClass('mvform-error');
};

// The main ModelViewForm Class
ModelViewForm = window.ModelViewForm = function ModelViewForm( options ) {
    var self = this;
    if ( !(self instanceof ModelViewForm) ) return new ModelViewForm( options );
    self.id = uuid('mvform');
    self.$options = $.extend({
        submit: true,
        upload: false,
        ajax: false,
        notify: true,
        model: false,
        livebind: false,
        prefixed: false,
        locale: { },
        Model: ModelViewForm.Model, 
        View: ModelViewForm.View
    }, options || { });
    self.initPubSub( );
};
ModelViewForm.VERSION = "1.0.0"; 
ModelViewForm.Model = Model;
ModelViewForm.View = View;
ModelViewForm.doSubmit = function( submitMethod, responseType, andUpload ) {
    responseType = responseType || 'json';
    if ( true === andUpload )
    {
        submitMethod = 'POST';
        return function( url, data, cb ) {
            var handler = function( res, textStatus ) {
                    if ( 'success' == textStatus ) cb( true, res );
                    else cb( false, res );
            };
            if ( !data instanceof window.FormData ) data = new window.FormData( data );
            $.ajax({
                type: submitMethod,
                method: submitMethod,
                dataType: responseType,
                url: url,
                data: data || null,
                // to accept formData as ajax data
                processData: false,
                contentType: false,
                success: handler, error: handler
            });
        };
    }
    else
    {
        return function( url, data, cb ) {
            var handler = function( res, textStatus ) {
                    if ( 'success' == textStatus ) cb( true, res );
                    else cb( false, res );
            };
            var is_form_data = ('undefined' !== typeof window.FormData) && (data instanceof window.FormData);
            $.ajax({
                type: submitMethod,
                method: submitMethod,
                dataType: responseType,
                url: url,
                data: data || null,
                // to accept formData as ajax data
                processData: !is_form_data,
                contentType: !is_form_data,
                success: handler, error: handler
            });
        };
    }
};
ModelViewForm.doGET = ModelViewForm.doSubmit( 'GET', 'json' );
ModelViewForm.doPOST = ModelViewForm.doSubmit( 'POST', 'json' );
ModelViewForm.doUpload = ModelViewForm.doSubmit( 'POST', 'json', true );
ModelViewForm.Attr = mvattr;
ModelViewForm.getKey = key_getter;
ModelViewForm.getValue = value_getter;
ModelViewForm.toModel = fields2model;
ModelViewForm.toJSON = model2json;
ModelViewForm.toFormData = model2formdata;
ModelViewForm.toUrlEncoded = model2params;

ModelViewForm[PROTO] = ModelView.Extend( Extend( Object[PROTO] ), ModelView.PublishSubscribeInterface, {
    constructor: ModelViewForm,
    
    id: null,
    $form: null,
    $view: null,
    $options: null,
    
    dispose: function( ) {
        var self = this;
        self.disposePubSub( );
        if ( self.$form /*&& self.$form.length*/ )
        {
            self.$form.off('submit.'+self.id);
            self.$form.modelview('dispose');
            self.$form.removeClass('mvform');
        }
        self.$form = null;
        self.$view = null;
        self.$options = null;
        self.id = null;
        return self;
    },
    
    trigger: function( evt, data, delay ) {
        var self = this, 
            $super = ModelView.PublishSubscribeInterface.trigger
        ;
        delay = delay || 0;
        if ( delay > 0 )
        {
            setTimeout(function( ){
                $super.call( self, evt, data );
            }, delay);
        }
        else
        {
            $super.call( self, evt, data );
        }
        return self;
    },
    
    one: function( evt, handler ) {
        return this.on( evt, handler, true );
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
        var self = this, $form = self.$form, mverror = mvattr( 'error' ), messages, mverr;
        if ( $form && $form.length && fields && fields.length )
        {
            self.$view.$model.notify( fields, 'error' );
            messages = $form.find('[' + mverror + ']');
            if ( messages.length )
            {
                messages.hide( );/*.each(function( ){
                    var $m = $(this);
                    if ( !!$m.attr('ref') ) $($m.attr('ref')).removeClass('mvform-error');
                    $m.hide( );
                });*/
                mverr = mverror + '="' + (self.$options.prefixed ? (self.$view.$model.id + '.') : '');
                $form.find( '[' + mverr + fields.join('"],['+mverr) + '"]' ).show( );/*.each(function( ){
                    var $m = $(this);
                    if ( !!$m.attr('ref') ) $($m.attr('ref')).addClass('mvform-error');
                    $m.show( );
                });*/
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
            }
        ;
        
        $form.addClass( 'mvform' ).prop( 'disabled', false ).attr( 'id', $form[0].id || uuid('mvform') );
        
        self.trigger('before-render');
        
        $form.find('['+mvattr( 'error' )+']').hide( );
        
        // parse fields and build model
        fields2model( $form.find('input,textarea,select'), dataModel, options.locale );
        
        // form modelview
        $form.modelview({
            autoSync: true,
            autobind: true,
            livebind: !!options.livebind,
            isomorphic: false,
            autovalidate: false,
            bindAttribute: mvattr( 'bind' ),
            events: ['change','error','click'],
            model: dataModel,
            modelClass: modelClass,
            viewClass: viewClass
        });
        self.$view = $form.modelview('view');
        
        //ajax_suggest( $form.find('input['+mvattr( 'ajax-suggest' )+']'), self );
        ajax_dependent_select( $form.find('select['+mvattr( 'ajax-options' )+']'), self );
        
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
                        if ( !!options.upload )
                            ModelViewForm.doUpload(options.ajax, ModelViewForm.toFormData(request), function( success, response ){
                                
                                self.trigger('after-send', {success:success,response:response});
                            
                            });
                        else
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
        
        self.trigger('after-render');
        
        return self;
    }
});
}(window, jQuery, ModelView, 'undefined' !== typeof Xpresion ? Xpresion : null);