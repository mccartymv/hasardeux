'use-strict';
var express = require('express');
var app = express();
var request = require('request');
var cheerio = require('cheerio');
var _ = require('underscore');
var mongoose = require('mongoose');
var logger = require('morgan');
var bodyParser = require('body-parser');
var fs = require('fs');
var path = require('path');
var options = require('../options');
var port = process.env.PORT || 7575;
var environment = process.env.NODE_ENV;


var dbUrl = options.storageConfig.dbUrl;

var options = { keepAlive: 300000, connectTimeoutMS: 30000, 
                useNewUrlParser: true };       
  
mongoose.connect(dbUrl, options);
var conn = mongoose.connection;

conn.on('error', console.error.bind(console, 'connection error:'));  
 
conn.once('open', function() {
    console.log("Connected to MongoDB...");
    var listSchema = mongoose.Schema({
        _id: Object,
        name: String,
        dateCreated: String,
        contents: Array,
        scrapes: Array,
        products: Array
    }, {collection : 'product-data'});
    var List = mongoose.model('Product-Data', listSchema);

    app.use(bodyParser.json({limit: '50mb'}));
    app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

    app.use(logger('dev'));

    app.use(function(req, res, next) {

        // Website you wish to allow to connect
        res.setHeader('Access-Control-Allow-Origin', '*');
   
        // Request methods you wish to allow
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
   
        // Request headers you wish to allow
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
   
        // Set to true if you need the website to include cookies in the requests sent
        // to the API (e.g. in case you use sessions)
        res.setHeader('Access-Control-Allow-Credentials', true);
   
        // Pass to next layer of middleware
        next();
    });


    /**
    var scrapeUrl = "https://rateyourmusic.com/customchart?page=1&chart_type=top&type=album&year=alltime&genre_include=1&include_child_genres=1&genres=noise&include_child_genres_chk=1&include=both&origin_countries=&limit=none&countries=";
    newFunction(scrapeUrl);

    async function newFunction(scrapeUrl) {    
        var newResults = await ws.myScrape(scrapeUrl);
        console.log(newResults);
    }
    */

    var api = '/api';
    app.get(api + '/get-lists', getLists);
    app.post(api + '/scrape-list-items', scrapeListItems);

    app.get(api + '/get-scrape-templates', getScrapeTemplates);

    app.post(api + '/new-list', newList);

    app.post(api + '/saveProduct', saveProduct);
    app.post(api + '/deleteProduct', deleteProduct);

    app.post(api + '/update-list', updateList);

    app.post(api + '/bufferToStage', bufferToStage);

    function getLists(req, res) {
        List.find({}).exec(function(err, docs) {
            if (err) {
                console.log("Error: " + err);
            }
            res.json(docs);
        });
    }

    function scrapeListItems(req, res) {

        var ws = require(req.body.scrapeLocation);

        List.find({}).exec(function(err, docs) {
            if (err) {
                console.log("Error: " + err);
            }

            var currentListItems = _.find(docs, function(doc) {
                return req.body.listId == String(doc['_id'])
            })['contents'];

            scrapeFunction(req.body.scrapeUrl);


            async function scrapeFunction(scrapeUrl) {    
                var newResults = await ws.myScrape(scrapeUrl);
                //console.log(newResults);
                _.each(newResults, function(result) {
                    // console.log(result.name);
                    if (_.find(currentListItems, function(item) {
                        return result.id === item.id
                    })) {
                        console.log("duplicate exists in list");
                    } else {
                        currentListItems.push(result);
                        //currentListItems.save();
                    }
                });
                List.updateOne({ "_id": mongoose.Types.ObjectId(req.body.listId) }, { $set: { "contents": currentListItems } }, function(err, mongoRes) {
                    console.log("updated " + mongoRes.modifiedCount + " document.");
                    res.json({});
                });
            }


        });
    }



    //tagScrapeItem();

    //var tagScrapeEngine = setInterval(function() { tagScrapeItem() }, Math.floor(Math.random() * (500000 - 150000)) + 150000);



    function tagScrapeItem() {


        // change to find all (empty object query) eventually. really just find one with unscraped tags in it's contents
        List.findOne({ "name" : "Music Artists" }).exec(function(err, doc) {
            if (err) {
                console.log("Error: " + err);
            }

            var ws = require(doc.scrapes[0].tagScrapeLocation);


            var scrapeItem = _.find(_.shuffle(doc.contents), function(item) {
                return item.hasBeenTagged == false
            });

            console.log(scrapeItem['name'] + ":");

            scrapeFunction("http://webcache.googleusercontent.com/search?q=cache:" + scrapeItem['href'], function(results) {
                //console.log(results);
                if (results.constructor === Object) {
                    scrapeItem.tags = results.tagArray;
                    scrapeItem.hasBeenTagged = true;
                    if (scrapeItem.name !== results.artistNameOverride) {
                        scrapeItem.name = results.artistNameOverride
                    }

                    List.updateOne({ "name" : "Music Artists" }, { '$set' : { "contents" : doc.contents } }, function(err) {
                        if (err) {
                            console.log(err);
                        }

                        console.log("updated with new tags");

                    });



                } else if (results == "candidate for deletion") {
                    //console.log("string");
                    List.updateOne({ "name" : "Music Artists" }, { '$pull' : { 'contents' : { 'id' : scrapeItem.id } } }, function(err) {
                        if (err) {
                            console.log(err);
                        }

                        console.log("removed candidate for deletion - " + scrapeItem.name);

                    });

                } else if (results == "error") {
                    console.log("tag scrape error.");
                }

            });


            async function scrapeFunction(scrapeUrl, callback) {           
                callback(await ws.myTagScrape(scrapeUrl));
                

            }
        });
        

/**




            var currentListItems = _.find(docs, function(doc) {
                return listId == String(doc['_id'])
            })['contents'];
            var currentItem = _.find(currentListItems, function(item) {
                return itemId == item.id
            });

            scrapeFunction(currentItem['href']);



*/

        }

    function getScrapeTemplates(req, res) {

        var responseObj = {};

        fs.readFile("scrape-files/myScrapeTemplate.js", "utf8", function(err, data) {
            //console.log(data);
            if (err) {
                console.log(err);
            }

            responseObj['scrapeTemplate'] = data;

            fs.readFile("scrape-files/myTagScrapeTemplate.js", "utf8", function(err, data) {
                if (err) {
                    console.log(err);
                }

                responseObj['tagScrapeTemplate'] = data;

                res.send(responseObj);
            });

        });


    }


    function newList(req, res) {
        var listObj = req.body;
        fs.writeFile(path.join(__dirname, listObj['scrapes'][0].location), listObj.scrapeJS, function(err) {
            if (err) {
                console.log(err);
            }

            console.log('scrape file saved.');

            fs.writeFile(path.join(__dirname, listObj['scrapes'][0].tagScrapeLocation), listObj.tagScrapeJS, function() {})
                if (err) {
                    console.log(err);
                }
                var now = new Date();
                listObj['dateCreated'] = now.toDateString();
                listObj['_id'] = mongoose.Types.ObjectId();
        
                const newListInstance = new List(listObj);
                newListInstance.save().then(() => { console.log('New List Successfully Saved in DB'); res.send({}); });

                console.log('tag scrape saved.');

        });
    }


    function saveProduct(req, res) {
        // console.log(req.body);

        var productObj = req.body;

        if (productObj.isNew) {
            productObj['_id'] = mongoose.Types.ObjectId();
            List.updateOne({ "_id": mongoose.Types.ObjectId(productObj.listId) }, { $push : { "products" : productObj } }, function(err, mongoRes) {
                if (err) {
                    console.log("Mongo Error: " + err);
                }
                console.log("updated " + mongoRes.modifiedCount + " document.");
                res.json({});
            });  
        } else {

            List.updateOne({ "_id": mongoose.Types.ObjectId(productObj.listId), "products.name": productObj.name }, { "products.$.canvasCode" : productObj.canvasCode }, function(err) {
                if (err) {
                    console.log("Mongo Error: " + err);
                }
                console.log("product updated.");
                res.json({});
            });
        }

    }

    function deleteProduct(req, res) {

        var productObj = req.body;

        List.updateOne({ "_id": mongoose.Types.ObjectId(productObj.listId) }, { $pull : { "products" : { "_id": mongoose.Types.ObjectId(productObj._id) } } }, function(err) {
            if (err) {
                console.log("Mongo Error: " + err);
            }
            console.log("product deleted");
            res.json({});
        });
    }

    function updateList(req, res) {

        // console.log(req.body);
        var listObj = req.body;

        List.updateOne({ "_id": mongoose.Types.ObjectId(listObj.listId) }, { $set : { "contents" : listObj.contents } }, function(err) {
            if (err) {
                console.log("Mongo Error: " + err);
            }
            console.log("list contents updated");
            res.json({});
        });

    }

    function bufferToStage(req, res) {

        // console.log("Request Body: \n" + req.body.buffer);

        var data = req.body.buffer.replace(/^data:image\/\w+;base64,/, "");
        var buf = Buffer.from(data, 'base64');
        fs.writeFile('./stage/canvas.png', buf, function(err) {
            console.log('image copy to stage successful');
            res.json({});
        });

        
    }




});

app.listen(port, function() {
    console.log('Express server listening on port ' + port);
    console.log('env = ' + app.get('env'))
});