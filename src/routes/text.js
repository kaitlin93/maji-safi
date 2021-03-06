var express = require('express');
var router = express.Router();
var models = require('../models/index.js');
var maps = require('../config/maps.js');
var Promise = require("bluebird");

var twilio = require('../config/twilio.js').twilio;
var twilio_number = require('../config/twilio.js').number;

module.exports = function(router){
    router.get('/texts/test', function(req, res, next){
        res.render('texts/test');
    });

    router.post('/texts/test', function(req, res, next){
        var message = req.body;
        var tmess = message.Body.split("=")[1];
        console.log(message);
        console.log(message.device_number);
        twilio.messages.create({ 
            to: message.device_number, 
            from: twilio_number, 
            body: tmess,   
        }, function(err, message) { 
            if(err){
                console.log(err);    
                res.send("uh oh");
            } else{
                console.log(message.sid); 
                res.send('smashign');
            }
        });
    });

    router.get('/texts', function(req, res, next){
            if(!req.query.From){
                res.render("texts/textus");   
            } else { 
                var sender = req.query.From;
                var info = req.query.Body;
                res.status(200);
                res.set('Content-Type', 'text/xml');

                models.Device.findAll({
                    where: {
                        phone_number: sender.split("+1")[1],
                    }
                }).then(function(devices){
                    if(devices == null || devices.length == 0){
                        maps.geocoder.geocode(info, function(err, location){
                            if(err || location.length==0){
                                console.log("test");
                                res.send('<Response><Message>Oops! That does not look like a valid location. Please retry.</Message></Response>');
                            } else {
                                models.Device.findAll({
                                    where: {
                                        location_x: {
                                            $between: [location[0].latitude - 5, location[0].latitude + 5],
                                        },
                                        location_y: {
                                            $between: [location[0].longitude - 5, location[0].longitude + 5], 
                                        }
                                    }
                                }).then(function(near_devices){
                                    maps.proximitySort(location[0].latitude, location[0].longitude, near_devices, function(results){
                                        var rescount = 3;
                                        if(results.length < 3) rescount = results.length;
                                        if(rescount == 0) {
                                            res.render('please_work', {
                                                message: 'Oh no! There are no devices near you!'
                                            });
                                        } else{
                                            var promises = [];
                                            for(var i=0; i < rescount; i++){
                                                promises.push(resultAsync(results[i].device)); 
                                            }

                                            Promise.all(promises).then(function(deviceGrades){
                                                var message = 'Best devices: \n';
                                                var submessages = [];
                                                for(var i = 0; i < rescount; i++){
                                                        submessages.push({
                                                            message: results[i].device.nickname +
                                                        ": " + deviceGrades[i].message +" ("+results[i].distance+"km) \n",
                                                            grade: deviceGrades[i].grade});
                                                }
                                                submessages.sort(function(a, b) {
                                                    return b.grade - a.grade;
                                                });
                                                for(var i = 0; i < rescount; i++){
                                                    message = message + (i+1) + ") " + submessages[i].message;   
                                                }
                                                res.send('<Response><Message>'+message+'</Message></Response>');
                                            });  
                                        }
                                    });
                                });
                            }
                        });
                    } else if(devices.length > 1){  
                        res.send('<Response><Message>Device duplicate error.</Message></Response>');
                    } else {
                        //water (1 or 0), pH, turbidity, temperature
                        var rates = info.split("Sample Rate:");
                        if(info == "Texts will now stop"){
                            console.log(info);
                        }
                        else if(rates[0] == ""){
                            console.log(info);
                        } 
                        else if(info == "Empty Text"){
                            console.log(info);
                        }
                        else{
                            var results = info.split(",");
                            if(results.length != 4){
                                res.send('<Response><Message>Message formatting error.</Message></Response>');   
                            }
                            var aqua = false;
                            if(results[0] == 1.00){
                                aqua = true;   
                            }
                            
                            models.TestResult.create({
                                water: aqua,
                                pH: results[1],
                                turbidity: results[2],
                                temperature: results[3],
                                device_id: devices[0].id
                            }).then(function(result){
                                console.log(result);
                                res.send('<Response></Response>');
                            });
                        }
                    }
                });
            }
        });
    
    router.post("/text/sdrecord/:device_id", function(req, res){
        models.Device.findOne({ 
            where: { 
                id: req.params.device_id 
            } 
        }).then(function(device) {
            twilio.messages.create({ 
                to: device.phone_number, 
                from: twilio_number, 
                body: "R,"+req.body.duration+","+(new Date()).toISOString()  
            }, function(err, message) { 
                if(err) console.log(err);
                else{
                    res.status(200);
                    res.contentType('text/html');
                    res.send( JSON.stringify({success: "yee buddy", }));
                }

            }); 
        });
    });

}
function resultAsync(device, callback){
    var today = Math.round(new Date().getTime() / 1000);
    var yesterday = today - (24 * 3600);
   
   return models.TestResult.findAll({
            limit: 4,
            where:{
                device_id: device.id,
                time: {
                    $gte: yesterday
                },
            },
            order: 'time DESC', 
    }).then(function(results){
        if(results.length == 0)
            return {
                message: "Device off", 
                grade: -1000000};
        else if(!results[0].water && !results[1].water){
            return {
                message: "No water", 
                grade: -2000000
            };   
        }
        else {  
            var grade = 0;
            for(var r = 0; r < results.length; r++){
                if(results[r].water){
                    grade = grade - Math.abs(7- results[r].pH) - (results[r].turbidity - 1)/5;
                    if(results[r].temperature > 15){
                        grade = grade - (results[r].temperature - 15)/5;
                    }
                }    
            }
            grade = 3 + grade/(results.length);
            if( grade <= 0 ) {
                return {
                    message: "bad", 
                    grade: grade
                };   
            } else if (grade >= 2.5){
                return {
                    message: "great!", 
                    grade: grade};
            } else {
                return {
                message: "good",
                grade: grade
                };   
            }
        }
    });
}
