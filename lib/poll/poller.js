/**
 * Copyright ©2017. The Regents of the University of California (Regents). All Rights Reserved.
 *
 * Permission to use, copy, modify, and distribute this software and its documentation
 * for educational, research, and not-for-profit purposes, without fee and without a
 * signed licensing agreement, is hereby granted, provided that the above copyright
 * notice, this paragraph and the following two paragraphs appear in all copies,
 * modifications, and distributions.
 *
 * Contact The Office of Technology Licensing, UC Berkeley, 2150 Shattuck Avenue,
 * Suite 510, Berkeley, CA 94720-1620, (510) 643-7201, otl@berkeley.edu,
 * http://ipira.berkeley.edu/industry-info for commercial licensing opportunities.
 *
 * IN NO EVENT SHALL REGENTS BE LIABLE TO ANY PARTY FOR DIRECT, INDIRECT, SPECIAL,
 * INCIDENTAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOST PROFITS, ARISING OUT OF
 * THE USE OF THIS SOFTWARE AND ITS DOCUMENTATION, EVEN IF REGENTS HAS BEEN ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * REGENTS SPECIFICALLY DISCLAIMS ANY WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE
 * SOFTWARE AND ACCOMPANYING DOCUMENTATION, IF ANY, PROVIDED HEREUNDER IS PROVIDED
 * "AS IS". REGENTS HAS NO OBLIGATION TO PROVIDE MAINTENANCE, SUPPORT, UPDATES,
 * ENHANCEMENTS, OR MODIFICATIONS.
 */

'use strict';

var config = require('config');
var AWS = require('aws-sdk');
var async = require('async');

var log = require('../core/logger')('queue-api');

const AWS_DEFAULT_REGION = config.get('aws.region');
const KEY = config.get('aws.credentials.key');
const SECRET = config.get('aws.credentials.secret');
const QUEUE_URL = config.get('sqs.queueUrl');
const DEAD_LETTER_QUEUE_URL = config.get('sqs.deadletter.queueUrl');

AWS.config.update({ accessKeyId: KEY, secretAccessKey: SECRET });
AWS.config.region = AWS_DEFAULT_REGION;

const SQS = new AWS.SQS({ apiVersion: config.get('sqs.apiVersion') });
const Lambda = new AWS.Lambda({ apiVersion: config.get('lambda.apiVersion') });

var totalMessagesProcessed = 0;
var totalMessagesInvoked = 0;

/**
 * Invoked polling lambda function with appropriate lambda parameters.
 *
 * @param  {Object}           message                   Message payload that will be used as event while invoking Lambda function
 * @param  {Object}           callback.err              An error that occurred, if any
 * @param  {Object}           callback.statement        The statement id that was accepted into the LRS
 */
var invokeLambdaWorker = function invokeLambdaWorker(message, callback) {
  var payload = JSON.stringify(JSON.parse(message.Body).data[0]);

  const params = {
    'FunctionName': config.get('lrs.ingestService'),
    'InvocationType': 'RequestResponse',
    'Payload': new Buffer(payload)
  };

  log.info('Invoking lambda with message: ' + message.MessageId);

  Lambda.invoke(params, function(err, result) {
    var lambdaResponse = null;
    if (err) {
      log.error({'err': err}, 'Unable to invoke the Lambda worker');
      return callback(err);

    } else {
      try {
        // When the Lambda function times out due to Memory errors, garbage collection etc the errorMessage sent back is just a string.
        // These errors are tracked in the catch bloack to raise suitable invoke exceptions which will result in adding the unprocessed
        // message into a dead letter queue for further processing.
        if (JSON.parse(result.Payload).hasOwnProperty('errorMessage')) {
          lambdaResponse = JSON.parse(JSON.parse(result.Payload).errorMessage);
        } else {
          lambdaResponse = JSON.parse(result.Payload);
        }
      } catch (err) {
        log.error({'result': result , 'err': err}, 'Lambda function stopped unexpectedly');
        return callback(err);
      }

      log.info({'message_id': message.MessageId, 'invokeStatus': result.StatusCode, 'lambdaResponse': lambdaResponse}, 'Message processed successfully. Statement ingestion complete.');
      return callback();
    }
  });
};

/**
 * Invoked polling lambda function with appropriate lambda parameters.
 *
 * @param  {Object}           message                   Message payload that will be used as event while invoking Lambda function
 * @param  {Object}           context                   Context object contains lambda runtime information such as functionName, CloudWatch log group etc.
 * @param  {Object}           callback.err              An error that occurred, if any
 * @param  {Object}           callback.statement        The statement that was accepted into the LRS
 */
var processMessage = function processMessage(message, callback) {
   // TODO : placeholder for packaging any invoke logic.
};

/**
 * Delete a message from the queue
 *
 * @param  {Message}    message           The SQS message to delete from the queue
 * @param  {Function}   callback          Standard callback function
 * @param  {Object}     callback.err      An error object, if any
 * @api private
 */
var deleteMessage = function(message, callback) {
  log.debug('Deleting message');
  var params = {
    'QueueUrl': QUEUE_URL,
    'ReceiptHandle': message.ReceiptHandle
  };
  SQS.deleteMessage(params, function(err) {
    if (err) {
      log.error({'err': err}, 'Unable to delete a message from the queue');
    }

    log.info('Message deleted: ' + message.MessageId);
    return callback();
  });
};

/**
 * Add a job on the queue
 *
 * @param  {Object}     message           The message to add
 * @param  {Function}   callback          Standard callback function
 * @param  {Object}     callback.err      An error object, if any
 */
var addMessage = module.exports.addMessage = function(message, callback) {
  var params = {
    'QueueUrl': config.get('sqs.deadletter.queueUrl'),
    'MessageBody': JSON.stringify(message)
  };
  SQS.sendMessage(params, function(err, data) {
    if (err) {
      log.error({'err': err, 'message': message}, 'Unable to queue the job to dead letter queue');
      return callback({'code': 500, 'msg': 'Unable to queue the job'});
    }

    log.info({'message_id': message.MessageId}, 'Added the failed job to the dead letter queue');
    return callback();
  });
};

/**
 * The function polls SQS and retrieves 10 messages at a time. Lambda functions are invoked for each of the messages for processing.
 *
 * @param  {Object}         functionName              Message payload that will be used as event while invoking Lambda function
 */
 function poll() {
   const params = {
     QueueUrl: QUEUE_URL,
     MaxNumberOfMessages: 10,
     VisibilityTimeout: 10,
     WaitTimeSeconds: 5
   };
   // batch request messages
   SQS.receiveMessage(params, function(err, data) {
     if (err) {
       log.error({'err': err}, 'Got an error trying to poll SQS queue.');
       return setTimeout(poll, 10000);
     }

     // for each message, reinvoke the function
     if (data.Messages) {
       var result = `Messages received: ${data.Messages.length}`;
       log.info(result);
       async.each(data.Messages, function(message, callback) {
         invokeLambdaWorker(message, function(err) {
           if (err) {
             log.error({'err': err}, 'Error occured while processing the message with id: ' + message.MessageId);
             // If an error occured during Lambda invoke the message is added to the SQS dead letter queue for future processing.
             // When Lambda concurrent execution limits(100) are reached the messages are sent to dead letter queue.
             addMessage(message.Body, function(err) {
               if (err) {
                 return callback(err);
               }

               log.info({'messageId': message.MessageId}, 'Added the failed job to the dead letter queue');
               return callback();
             });

           } else {
             log.info({'messageId' : message.MessageId}, 'Proceeding with deletion of message');
             // If message was processed successfully with Lambda invoke then delete message with identifier
             deleteMessage(message, function(err) {
               if (err) {
                 return callback(err);
               }

               return callback();
             });
           }
         });
       }, function(err) {
         if (err) {
           return setTimeout(poll, 10000);
         }

         log.info('Finished processing a batch. Polling for new messages');
         return setTimeout(poll, 100);
       });
     } else {
       // Timeouts are included since there is a cap on number of Lamba workers that can be concurrently executed. Currently the number is 100.
       // The Lambda concurrent execution can be changed
       log.info('No Messages found yet. Re-invoking poller');
       return setTimeout(poll, 20000);
     }
   });
 };

/**
 * Initialize the SQS poller
 *
 * @param  {Function}   callback    Standard callback function
 */
 var init = module.exports.init = function(callback) {
   // Start polling the SQS queue
   var asyncTasks = [];
   log.info('Asynchronous parallel SQS polling initiated. Waiting for messages');

   // The max amount of messages that can be processed on a single receive is 10.
   // Setting the concurrencyCount in the config helps to spin multiple pollers within the same deployment.
   // Invoking more pollers helps in processing more messages. Also, provides the ability to throttle the lambda invokes.s
   async.times(config.get('poller.concurrencyCount'), function(n, next) {
     asyncTasks.push(function(callback) {
       poll();
     });
     next();
   }, function() {
     async.parallel(asyncTasks, function(err) {
       if (err) {
         return callback(err);
       }

       log.info("Asynchronous parallel polling ended. Restarting poller");
       init(function() { });
     });
   });

   return callback();
 };
