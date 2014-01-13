(function($) {
  return $.fn.serializeObject = function(clean) {
    var json, patterns, push_counters,
      _this = this;
    json = {};
    push_counters = {};
    patterns = {
      validate: /^[a-zA-Z][a-zA-Z0-9_]*(?:\[(?:\d*|[a-zA-Z0-9_]+)\])*$/,
      key: /[a-zA-Z0-9_]+|(?=\[\])/g,
      push: /^$/,
      fixed: /^\d+$/,
      named: /^[a-zA-Z0-9_]+$/
    };
    this.build = function(base, key, value) {
      base[key] = value;
      return base;
    };
    this.push_counter = function(key) {
      if (push_counters[key] === void 0) {
        push_counters[key] = 0;
      }
      return push_counters[key]++;
    };
    $.each($(this).serializeArray(), function(i, elem) {
      var k, keys, merge, re, reverse_key;
      if (!patterns.validate.test(elem.name) || clean && _(elem.value).isBlank()) {
        return;
      }
      keys = elem.name.match(patterns.key);
      merge = elem.value;
      reverse_key = elem.name;
      while ((k = keys.pop()) !== void 0) {
        if (patterns.push.test(k)) {
          re = new RegExp("\\[" + k + "\\]$");
          reverse_key = reverse_key.replace(re, '');
          merge = _this.build([], _this.push_counter(reverse_key), merge);
        } else if (patterns.fixed.test(k)) {
          merge = _this.build([], k, merge);
        } else if (patterns.named.test(k)) {
          merge = _this.build({}, k, merge);
        }
      }
      return json = $.extend(true, json, merge);
    });
    return json;
  };
})(jQuery);


var App = {};

var deviceMenu = _.template(
    '<div class="submenu">'
        +'<ul>'
            +'<li><a href="#" class="deviceSubmenu" data-action="identify" data-id="<%= obj.id %>">Identify</a></li>'
            +'<li><a href="#" class="deviceSubmenu" data-action="reload" data-id="<%= obj.id %>">Reload Window</a></li>'
    +'</div>'
);

var logEntry = _.template(
    '<li>'
        +'<span class="date"><%= date %></span> <%= message %>'
    +'</li>'
);

window.socket = io.connect();

window.socket.on('welcome', function(data){
    _.extend(App, {config: data});
})

window.socket.on('error', function(err){
    App.socketError = true;
})

window.socket.on('reconnect', function(){
    setTimeout(function(){
        window.location.reload();
    }, 800);
})

var DuckCastModel = Backbone.Model.extend({
    urlRoot: 'duckcast'
    , socket: window.socket
    , initialize: function () {
        _.bindAll(this, 'serverChange', 'serverRemove', 'modelCleanup');
        this.ioBind('update', this.serverChange, this);
        this.ioBind('delete', this.serverRemove, this);
    }
    , serverChange: function ( data ) {
        console.log(data);
    }
    , serverRemove: function ( data ) {
        this.modelCleanup();
    }
    , modelCleanup: function () {
        this.ioUnbindAll();
        this.collection.remove(this);
    }
});
var DuckCastCollection = Backbone.Collection.extend({
    model: DuckCastModel
    , url: 'duckcasts'
    , socket: window.socket
    , initialize: function () {
        _.bindAll(this, 'serverCreate', 'collectionCleanup');
        this.ioBind('create', this.serverCreate, this);
        this.ioBind('cleanup', this.serverCleanup, this);
        this.fetch();
    }
    , serverCreate: function (data) {
        this.add(data);
    }
    , serverCleanup: function() {
        this.reset();
    }
    , collectionCleanup: function () {
        _.each(this.models, function(model){
            model.modelCleanup();
        })
    }
})

App.duckcast = new DuckCastCollection();

var Content = Backbone.View.extend({
    el: $('#mainContent')
    , collection: App.duckcast
    , events: {
        'submit #setSite': 'setDuckcastSite',
        'submit #setDomain': 'setPortSettings',
        'click .queryDevice': 'queryDevice',
        'click .deviceSubmenu': 'deviceContextMenu',
        'click .restart': 'restartProcess',
        'click .reloadStylesheets': 'reloadStylesheets',
        'click .toogleLogs': 'toggleLogs',
        'click .clearLog': 'clearLog'
    }
    , initialize: function() {
        $('.identifier').hide();
        $('.loading').hide();
        this.$el.animate({left: '-45%'}, 20, function(){
            $(this).addClass('collapsed');
        })
        this.listenTo(this.collection, 'add', this.updateDevices);
        this.listenTo(this.collection, 'remove', this.removeDevices);
        this.listenTo(this.collection, 'reset', this.removeAllDevices);
    }
    , updateDevices: function(data) {
        var model = this.collection.get(data.attributes.id);
        var obj = model.toJSON();
        if(!obj.type) return false;

        var compiled = _.template(
            '<div class="device" id="<%= obj.id %>">'
                +'<img src="/images/<%= obj.type %>.png">'
                +'<span><%= obj.title %></span>'
                +'<a href="#" data-device-id="<%= obj.id %>" class="queryDevice">MENU</a>'
            +'</div>'
        );
        var html = compiled({obj: obj});
        this.$('.deviceList').append(html);
    }
    , removeDevices: function(data) {
        var target = this.$el.find('#'+data.attributes.id);
        if(target && target.length) {
            $(target).remove();
        }
    }
    , removeAllDevices: function() {
        var targets = this.$el.find('.device');
        if(targets && targets.length) {
            _.each(targets, function(target){
                $(target).remove();
            })
        }
    }
    , setDuckcastSite: function(event) {
        event.preventDefault();
        var query = $(event.target).serializeArray();
        if(!query[0].value.match(/(http|https):\/\/[\w\-_]+(\.[\w\-_]+)+([\w\-\.,@?^=%&:/~\+#]*[\w\-\@?^=%&/~\+#])?/g)) return alert('Not a valid url');

        var request = $.ajax({
            url: '/setSite'
            , data: {url: query[0].value}
            , method: 'POST'
        })
        request.done(function(res, status, xhr){
            var html = logEntry({date: new Date(), message: 'Site set to: '+query[0].value});
            var target = $('ul.logentry');
            $(target).prepend($(html).slideDown());
        })
    }
    , setPortSettings: function(event) {
        event.preventDefault();
        var values = $(event.currentTarget).serializeObject();
        if(values.proxyPort === '5001' || values.proxyPort === '5002') return alert('The ProxyPort provided is reserved by the system, please set to another port');
        if(values.managerPort === '5001' || values.managerPort === '5002') return alert('The ManagerPort provided is reserved by the system, please set to another port');
        if(values.proxyPort === values.managerPort) return alert('Proxy and Manager Port cannot be the same.. please change');

        var request = $.ajax({
            url: '/setPorts'
            , data: values
            , method: 'POST'
        })
        request.done(function(res, status, xhr){
            var html = logEntry({date: new Date(), message: 'Ports changed'});
            var target = $('ul.logentry');
            $(target).prepend($(html).slideDown());
        })
    }
    , queryDevice: function(event) {
        event.preventDefault();

        if($(event.currentTarget).next().hasClass('submenu')) {
            $(event.currentTarget).next().hide().remove();
            return false;
        }
        var data = $(event.currentTarget).data();
        var html = deviceMenu({obj: {id: data.deviceId}});

        $(html).insertAfter($(event.currentTarget));
    }
    , deviceContextMenu: function(event) {
        event.preventDefault();
        var data = $(event.currentTarget).data();
        $(event.currentTarget).closest('.submenu').hide().remove();
        socket.emit('manageDevice', data);

    }
    , clearErrorLog: function(event) {
        event.preventDefault();
        this.$('.errorTerminal').children().remove();
    }
    , restartProcess: function(event) {
        event.preventDefault();
        var data = $(event.currentTarget).data();
        socket.emit('restartProcess', data);
    }
    , reloadStylesheets: function(event) {
        event.preventDefault();
        socket.emit('updateStylesheets');
    }
    , toggleLogs: function(event) {
        event.preventDefault();
        $(event.currentTarget).next('div').toggle();
    }
    , clearLog: function(event) {
        $(event.currentTarget).next('ul').children().remove();
        return false;
    }
})

App.content = new Content();

window.socket.on('lastRequest', function(url){
    var target = App.content.$el.find('p.deepLink');
    $(target).text(url);
})

window.socket.on('log', function(message){
    var html = logEntry({date: new Date(), message: message});
    var target = $('ul.logentry');
    $(target).prepend($(html).slideDown());

})
