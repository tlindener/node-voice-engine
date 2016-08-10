var assert = require('chai').assert;
var should = require('chai').should();
var Engine = require('../lib/voice-engine');
var config = require('../config.json');
var engine = new Engine(config.services.sttengine, config.services.ttsengine, {
    model: './hey_emma.pmdl',
    sensitivity: 0.5
});

describe('voice-engine', function() {
    it('should synthesize text', function(done) {
        this.timeout(300000);

        engine.on('synthesized', function() {
            done();
        })
        engine.synthesizeText("Test");
    });

    it('should kill the process', function(done) {
        this.timeout(300000);

        engine.on('keyword', function() {
            done();
        })
        engine.startKeywordSpotting()
        engine.killKwsProcess(done);
    });


});
