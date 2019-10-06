const data = require('./data.json');
const _ = require('lodash');
const async = require('async');
const AWS = require('aws-sdk');

const dynamoDb = new AWS.DynamoDB({ apiVersion: '2012-08-10', region: 'us-east-1' });

function putWords(data, cb) {
    var arrayOfArray25 = _.chunk(data, 25);
    async.every(arrayOfArray25, function (arrayOf25, callback) {
        var params = {
            RequestItems: {
                'eco_questions': []
            }
        };
        arrayOf25.forEach(function (item, index) {
            console.log(`index: ${index} ) : ${JSON.stringify(item)} `);
            params.RequestItems['eco_questions'].push(item);
        });
        dynamoDb.batchWriteItem(params, function (err, data) {
            if (err) {                
                console.log(err);
                callback(err);
            } else {
                console.log(data);
                callback(null, true);
            }
        });
    }, function (err, result) {
        if (err) {
            cb(err);
        } else {
            if (result) {
                cb(null, { allWritten: true });
            } else {
                cb(null, { allWritten: false });
            }
        }
    });
}

putWords(data.eco_questions, function () { });