var express = require('express');
var router = express.Router();
var models = require('../models/index.js');
var Promise = require('bluebird');
var httpAdapter = 'https';


module.exports = function(router, passport){
    //DEVICE ROUTES
    router.get('/devices', function(req, res, next){
        res.redirect('/admin'); 
    });
    
    router.get('/devices/add',isLoggedIn, function(req, res, next){
        var admin = req.user;
        res.render('admin/adddevice', { admin: admin});
    });

    router.get('/devices/:device_id', function(req, res, next){
        var admin = req.user;
        var device_id = req.params.device_id;
        models.Device.findAll({
                where: {
                    id: device_id
                }
            }).then(function(device){
                models.TestResult.findAll({
                    limit: 50,
                    where: {
                        device_id: device_id   
                    }, 
                    order: 'time DESC',
                }).then(function(results){
                    res.render('admin/device', {
                        device: device[0],
                        results: results,
                        admin: admin
                    });
                });
            });
    });

    router.post('/devices/add', isLoggedIn, function(req, res){
        var admin = req.user;
        var input = req.body;
        models.Device.create({ 
                nickname: input.nickname,
                phone_number: input.phone_number,
                location_x: parseFloat(input.location_x),
                location_y: parseFloat(input.location_y),
                sampling_rate: input.sampling_rate,
                messaging_rate: input.messaging_rate,
                AdminId: admin.id,
        })
        .then(function(dev){
             res.redirect('/devices/'+ dev.id);
        });
    });

    router.post('/devices/update/:device_id', isLoggedIn, function(req, res){
        var input = req.body;
        models.Device.findOne({ 
            where: { id: req.params.device_id } 
        }).then(function(device) {
            device.update({ 
                nickname: input.nickname,
                phone_number: input.phone_number,
                location_x: parseFloat(input.location_x),
                location_y: parseFloat(input.location_y),
                sampling_rate: input.sampling_rate,
                messaging_rate: input.messaging_rate,
            }).then(function(dev){
                res.redirect('/devices/'+dev.id);         
            });
        });
    });
    

    router.get('/devices/delete/:device_id', isLoggedIn, function(req, res, next){
        models.Device.findOne({ 
            where: { 
                id: req.params.device_id 
            } 
        }).then(function(device) {
            device.destroy();
            res.redirect('/admin');
        });
    });
    
    router.post("/device/sdrecord", function(res, req){
        twilio.messages.create({ 
            to: device.phone_number, 
            from: twilio_number, 
            body: message,   
        }, function(err, message) { 
            if(err) console.log(err);
    }); 
    });

}

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated())
        return next();
    res.redirect('/login');
}
