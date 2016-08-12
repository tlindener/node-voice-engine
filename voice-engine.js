/* Copyright 2016 Tobias Lindener
 Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and limitations under the License.
*/
"use strict";
var events = require('events');
var cp = require('child_process');
var watson = require('watson-developer-cloud');
var format = require('util').format;
var fs = require('fs');
var requests = [];
var uuid = require('node-uuid');
var bunyan = require('bunyan');
var log = bunyan.createLogger({
    name: 'VoiceEngine'
});
const path = require('path');


class VoiceEngine extends events.EventEmitter {

    constructor(stt_config, tts_config, kws) {
        super();
        this.stt_config = stt_config;
        this.tts_config = tts_config;
        this.kws = kws;
        this.kwsProcess;
        this.sttInProgress = false;
        this.kwsInProgress = false;
        this.micProcess;
        this.flacProcess;
        this.hasFlac = false;
        this.firstRun = true;

    }

    isOnlineRecognitionInProgress() {
        return this.sttInProgress;
    }
    isKwsInProgress() {
        return this.kwsInProgress;
    }

    startKeywordSpotting() {
        log.info("start keyword spotter");
        var self = this;
        this.kwsInProgress = true;
        var kwsPath = path.resolve(__dirname, 'speech', 'kws.py')
        this.kwsProcess = cp.spawn('python', [kwsPath, this.kws.sensitivity, this.kws.model], {
            detached: false
        })

        function extractKWSEvent(data) {
            var message = data.toString()
            if (message.startsWith('INFO')) {
                log.info("Keyword spotted");
                self.emit('keyword');
            } else {
                log.info(message)
            }

        }


        this.kwsProcess.stderr.on('data', extractKWSEvent);
    }
    killKwsProcess(cb) {
        if (this.kwsProcess != null) {
            try {
                this.kwsProcess.kill();
                this.kwsInProgress = false;
                cb();
            } catch (ex) {
                log.warn(ex);
                cb(ex);
            }

        }
    }
    pauseOnlineRecongnitionProcess(cb) {

        log.info("Stop piping data");
        this.recognizeStream.end();
        if (this.hasFlac) {

            this.flacProcess.stdout.unpipe();
            this.micProcess.stdout.unpipe();

        } else {
            this.micProcess.stdout.unpipe();
        }

        this.sttInProgress = true;
        cb();
    }

    killRecognitionProcesses(cb) {

        try {
            this.micProcess.kill();
            if (this.hasFlac) {
                this.flacProcess.kill();
            }
            this.sttInProgress = false;
            cb();
        } catch (ex) {
            log.warn(ex);
            cb(ex);
        }
    }





    synthesizeText(text) {
        log.info("Online text synthesizing started!");
        var self = this;
        var text_to_speech = watson.text_to_speech({
            username: self.tts_config.username,
            password: self.tts_config.password,
            version: 'v1',
            url: self.tts_config.url
        });
        var params = {
            text: text,
            voice: (self.tts_config.voice != undefined) ? self.tts_config.voice : "en-US_LisaVoice",
            accept: 'audio/ogg; codec=vorbis' //'audio/wav'
        };

        function audioFilePath(voice, text) {
            // todo: ensure this directory exists
            var folderPath = (self.tts_config.cache != undefined) ? self.tts_config.cache : path.join(__dirname, 'cache');
            return path.join(folderPath, 'v_' + voice + "_t_" + text.replace(/[^a-z0-9-_]/ig, '-') + '.ogg').toString();

        }

        var outfile = audioFilePath(params.voice, text);
        log.info("synthesizeText", outfile);
        fs.exists(outfile, function(alreadyCached) {
            if (alreadyCached) {
                log.info('using cached audio: %s', outfile);
                self.emit("synthesized", {
                    filename: outfile
                });
            } else {
                log.info('fetching audio: %s', text);
                // Pipe the synthesized text to a file
                text_to_speech.synthesize(params)
                    .pipe(fs.createWriteStream(outfile))
                    .on('error', function(err) {
                        log.info(err);
                        self.emit('synthesized-error', err);
                    })
                    .on('close', function() {
                        log.info("File saved");
                        self.emit("synthesized", {
                            filename: outfile
                        });
                    });
            }
        });
    }





    startSttRecognition() {
        log.info("Online speech recognition started!");
        this.sttInProgress = true;
        var self = this;
        if (self.firstRun) {
            try {
                self.hasFlac = !!cp.execSync('which flac').toString().trim()
                log.info("hasFlac", self.hasFlac);
            } catch (ex) {
                // I think cp.execSync throws any time the exit code isn't 0
            }
            self.firstRun = false;
            self.recognizeStream = createOnlineRecognitionStream();
            spawnMicrophoneProcess();
            pipeData(self.recognizeStream);
        } else {
            self.recognizeStream = createOnlineRecognitionStream();
            pipeData(self.recognizeStream);
        }

        function createOnlineRecognitionStream() {
            var params = {
                content_type: self.hasFlac ? 'audio/flac' : 'audio/l16; rate=44100',
                "X-Watson-Learning-Opt-Out": true,
                profanity_filter: false
            };
            var speech_to_text = watson.speech_to_text({
                username: self.stt_config.username,
                password: self.stt_config.password,
                version: 'v1',
                url: self.stt_config.url
            });
            var recognizeStream = speech_to_text.createRecognizeStream(params);
            log.info("create recognizeStream");
            recognizeStream.setEncoding('utf8'); // to get strings instead of Buffers from `data` events

            // Listen for events.
            recognizeStream.on('error', function(event) {
                onEvent('recognition-error', event);
            });
            recognizeStream.on('close-connection', function(event) {
                onEvent('recognition-close', event);
            });

            // Displays events on the console.
            function onEvent(name, eventData) {
                self.emit(name, eventData);
                log.info(name, eventData);
            };
            recognizeStream.on('results', function(message) {
                var request = message.results[0].alternatives[0].transcript;
                if (message.results[0].final && request.length > 1) {
                    log.info("Recognition is final");
                    log.info("recognition-result", request);
                    var message = {
                        id: uuid.v4(),
                        request: request,
                        raw: message.results[0]
                    };
                    self.emit('recognition', message);
                    self.pauseOnlineRecongnitionProcess(function(err) {
                        if (!err) {
                            self.emit('recognition-stopped');
                        }
                    })
                }
            });
            return recognizeStream;
        }

        function spawnMicrophoneProcess() {
            log.info("Spawn microophone process");
            self.micProcess = cp.spawn('arecord', ['--format=S16_LE', '--rate=44100', '--channels=1']);
            self.micProcess.on('close', function(code) {
                log.info('closing mic with code: ' + code);

                self.sttInProgress = false;
                log.info("Online speech recognition stopped!");

            });
            if (self.hasFlac) {
                self.flacProcess = cp.spawn('flac', ['-0', '-', '-']);
            }
        }

        function pipeData(recognizeStream) {
            log.info("Start piping data");
            if (self.hasFlac) {
                self.micProcess.stdout.pipe(self.flacProcess.stdin);
                self.flacProcess.stdout.pipe(recognizeStream);
            } else {
                self.micProcess.stdout.pipe(recognizeStream);
            }
        }


    }






}
module.exports = VoiceEngine;
