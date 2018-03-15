var AWS = require('aws-sdk');
var uuid = require('uuid');
var config = require('config');
var async = require('async');

const KEY = config.get('aws.credentials.key');
const SECRET = config.get('aws.credentials.secret');
const QUEUE_URL = config.get('sqs.queueUrl');

AWS.config.update({accessKeyId: KEY, secretAccessKey: SECRET});
AWS.config.region = 'us-west-2';

var sqs = new AWS.SQS({ apiVersion: config.get('sqs.apiVersion') });

var msg =  {
    "@context": "http://purl.imsglobal.org/ctx/caliper/v1p1",
    "uuid": "dec0cef3-6e88-4cfa-b0ea-adbb1107ee9a",
    "type": "SessionEvent",
    "actor": {
        "id": "http://caliper.canvaslms.com/live-events/users/10720000001133399",
        "type": "Person",
        "extensions": [
            {
                "user_login": "1133399",
                "root_account_id": "school-1",
                "root_account_lti_guid": "794d72b707af6ea82cfe3d5d473f16888a8366c7.canvas.kr"
            }
        ]
    },
    "action": "LoggedIn",
    "object": {
        "id": "http://caliper.canvaslms.com/live-events",
        "type": "SoftwareApplication",
        "extensions": [
            {
                "redirect_url": "http://canvas.docker/profile/communication"
            }
        ]
    },
    "eventTime": "2016-10-10T18:54:43.000Z",
    "edApp": {
        "id": "http://caliper.canvaslms.com/live-events",
        "type": "SoftwareApplication"
    },
    "session": {
        "id": "http://caliper.canvaslms.com/live-events/sessions/62d3d85aeae7b3bb396352c8f620e7dc",
        "type": "Session"
    },
    "extensions": [
        {
            "hostname": "canvas.docker",
            "request_id": "f59bd0db-f52f-4ab9-a994-6ed00470fd3c",
            "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.143 Safari/537.36"
        }
    ]
};

var sendMessage = function(msg, callback) {
  msg.uuid = uuid.v4();
  msg.eventTime
  var sqsParams = {
    MessageBody: JSON.stringify(msg),
    QueueUrl: QUEUE_URL,
  };

  sqs.sendMessage(sqsParams, function(err, data) {
    if (err) {
      console.log('ERR', err);
      callback(err);
    }

    console.log(data);
  });

  return callback();
}

var generateDummyMessages = function () {

  async.times(20000, function(n) {
    sendMessage(msg, function(err) {
    });
  }, function(err) {
    console.log("All done !")
  });
}

generateDummyMessages();
