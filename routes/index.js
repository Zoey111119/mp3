/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
    require('./home.js')(router);
    require('./users.js')(router);
    app.use('/api',router);
};
