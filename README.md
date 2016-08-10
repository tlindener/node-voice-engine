# Smart Home Assistant - Voice Engine
This is a component of the Smart Home Assistant project. The voice-engine is responsible for keyword spotting locally with the help of Kitt.ai snowboy and uses IBM Watson Speech to Text and Text to Speech to interact naturally with the user.

It is in this form usable as a library only.

## Usage
```
var VoiceEngine = require('voice-engine');

var sttengine = {
    url: "https://stream.watsonplatform.net/speech-to-text/api",
    username: "",
    password: ""
}
var ttsengine = {
  url:"https://stream.watsonplatform.net/text-to-speech/api",
  username:"",
  password:""
}
var speech = {
model: "hey_emma.pmdl",
sensitivity: 0.4
}
var engine = new VoiceEngine(sttengine, ttsengine, speech);

engine.startKeywordSpotting();
engine.startSttRecognition();
engine.synthesizeText(text);

engine.on('keyword', function() {


})
engine.on('recognition-stopped', function() {

})

engine.on('recognition', function(message) {

})
engine.on('synthesized', function(message) {

})
```

## Requirements

In order to run the voice engine successfully you will need to install some components.

First you need a couple of them for the snowboy toolkit
> sudo apt-get install libatlas-base-dev swig3.0 python-pyaudio python3-pyaudio sox -y

Second you'll need one dependency for the node-speaker module
> sudo apt-get install libasound2-dev -y

Third I recommend installing the flac module to lower the cost of STT recognition
> sudo apt-get install flac -y

If you are running this on a raspberry pi you also have to change the \_snowboydetect library.
You can get different prebuild binaries from here: https://github.com/Kitt-AI/snowboy

Also you need to configure the alsa sound system accordingly:

```
#asym fun start here. we define one pcm device called "pluged"
pcm.pluged {
    type plug
    #this is your output device
    slave.pcm "hw:0,1"
}

#one called "dsnooped" for capturing
pcm.dsnooped {
    ipc_key 1027
    type dsnoop
    #this is your input device
    slave.pcm "hw:1,0"
}

#and this is the real magic
pcm.asymed {
    type asym
    playback.pcm "pluged"
    capture.pcm "dsnooped"
}

#a quick plug plugin for above device to do the converting magic
pcm.pasymed {
    type plug
    slave.pcm "asymed"
}

#a ctl device to keep xmms happy
ctl.pasymed {
    type hw
    card 0
}

#for aoss:
pcm.dsp0 {
    type plug
    slave.pcm "asymed"
}

ctl.mixer0 {
    type hw
    card 0
}

pcm.!default {
    type plug
    slave.pcm "asymed"
}
```
## Credits

The awesome Keyword spotting including the necessary python scripts are provided by Kitt.ai. Check their Licensing before using!
The above .asoundrc script is provided by Evan Cohen http://docs.smart-mirror.io/docs/configure_the_pi.html. Check out his Magic Mirror!

## License

Copyright 2016 Tobias Lindener

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

```
http://www.apache.org/licenses/LICENSE-2.0
```
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
