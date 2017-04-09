odoo.define('voip_sip_webrtc.voip_call_notification', function (require) {
"use strict";

var core = require('web.core');
var framework = require('web.framework');
var Model = require('web.DataModel');
var session = require('web.session');
var web_client = require('web.web_client');
var Widget = require('web.Widget');
var ajax = require('web.ajax');
var bus = require('bus.bus').bus;
var Notification = require('web.notification').Notification;
var WebClient = require('web.WebClient');


var _t = core._t;
var qweb = core.qweb;

ajax.loadXML('/voip_sip_webrtc/static/src/xml/voip_window2.xml', qweb);

var mySound = "";
var countdown;
var secondsLeft;
var callSeconds;
var call_id = "";
var myNotif = "";
var outgoingNotification

var peerConnectionConfig = {
    'iceServers': [
        {'urls': 'stun:stun.services.mozilla.com'},
        {'urls': 'stun:stun.l.google.com:19302'},
    ]
};

//navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
navigator.mediaDevices.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mediaDevices.getUserMedia || navigator.msGetUserMedia;
window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

var localStream;
var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');
var remoteStream = "";

WebClient.include({

    show_application: function() {

        $('body').append(qweb.render('voip_sip_webrtc.VoipWindow', {}));

        $(".s-voip-manager").draggable();

        bus.on('notification', this, function (notifications) {
            _.each(notifications, (function (notification) {


                if (notification[0][1] === 'voip.notification') {
					var self = this;

					call_id = notification[1].call_id;
					if (notification[1].direction == 'incoming') {
				    	var from_name = notification[1].from_name;
                        var ringtone = notification[1].ringtone;
                        var caller_partner_id = notification[1].caller_partner_id

                        var notif_text = from_name + " wants you to join a " + notification[1].mode;

                        countdown = notification[1].ring_duration

                        var incomingNotification = new VoipCallIncomingNotification(self.notification_manager, "Incoming Call", notif_text, call_id);
	                    self.notification_manager.display(incomingNotification);
	                    mySound = new Audio(ringtone);
	                    mySound.loop = true;
	                    mySound.play();

	                    //Display an image of the person who is calling
	                    $("#voipcallincomingimage").attr('src', '/web/image/res.partner/' + caller_partner_id + '/image_medium/image.jpg');


				    } else if (notification[1].direction == 'outgoing') {
					    var to_name = notification[1].to_name;

                        var notif_text = "Calling " + to_name;
                        var callee_partner_id = notification[1].callee_partner_id

                        countdown = notification[1].ring_duration

                        outgoingNotification = new VoipCallOutgoingNotification(self.notification_manager, "Outgoing Call", notif_text, call_id);
	                    self.notification_manager.display(outgoingNotification);

                        //Display an image of the person you are calling
	                    $("#voipcalloutgoingimage").attr('src', '/web/image/res.partner/' + callee_partner_id + '/image_medium/image.jpg');
					}
                } else if (notification[0][1] === 'voip.response') {
					var status = notification[1].status;
					var type = notification[1].type;
					var constraints = notification[1].constraints;

					call_id = notification[1].call_id;

					//Destroy the notifcation because the call was accepted or rejected, no need to wait until timeout
					if (typeof outgoingNotification !== "undefined") {
					    outgoingNotification.destroy(true);
					}

					if (status == "accepted") {
                        $(".s-voip-manager").css("opacity","1");


                        //Ask for media access
                        navigator.mediaDevices.getUserMedia(constraints).then(getUserMediaSuccess).catch(getUserMediaError);
                        /*if (navigator.mediaDevices.getUserMedia) {
                            navigator.mediaDevices.getUserMedia( constraints, getUserMediaSuccess, getUserMediaError);

                        }*/
			    	}
			    } else if (notification[0][1] === 'voip.start') {
					console.log("Start Call");

                    window.peerConnection.createOffer().then(createdDescription).catch(errorHandler);

				} else if(notification[0][1] === 'voip.sdp') {
                    var sdp_json = notification[1].sdp;
                    var sdp = JSON.parse(sdp_json)['sdp'];
                    console.log("Got SDP");
                    console.log(sdp_json);

                    window.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp)).then(function() {
						console.log("Set Remote Description");
                        // Only create answers in response to offers
                        if(sdp.type == 'offer') {
							console.log("Create Answer");
                            window.peerConnection.createAnswer().then(createdDescription).catch(errorHandler);
                        }
                    }).catch(errorHandler);

				} else if(notification[0][1] === 'voip.ice') {
                    var ice_json = notification[1].ice;
                    var ice = JSON.parse(ice_json)['ice'];
                    console.log("Got ICE");
                    console.log(ice_json);
					peerConnection.addIceCandidate(new RTCIceCandidate(ice)).catch(errorHandler);
				} else if(notification[0][1] === 'voip.end') {
                    console.log("Call End");
                    //localVideo.src = "";
                    localStream.getAudioTracks()[0].stop();
                    localStream.getVideoTracks()[0].stop();
                    remoteVideo.srcObject = localStream;
                    remoteStream.getAudioTracks()[0].enabled = false;
                    remoteStream.getAudioTracks()[0].stop();
                    remoteStream.getVideoTracks()[0].stop();

                    $(".s-voip-manager").css("opacity","0");
				}


            }).bind(this));

        });
        return this._super.apply(this, arguments);
    },

});

function errorHandler(error) {
    console.log(error);
}

function getUserMediaSuccess(stream) {
    console.log("Got Camera Access");


    $.ajax({
	    method: "GET",
		url: "/voip/call/connect",
		data: { call: call_id },
            success: function(data) {

        }
    });

    localVideo = document.querySelector('#localVideo');
    remoteVideo = document.querySelector('#remoteVideo');

    localStream = stream;
	localVideo.src = window.URL.createObjectURL(stream);

    window.peerConnection = new RTCPeerConnection(peerConnectionConfig);
    window.peerConnection.onicecandidate = gotIceCandidate;
    window.peerConnection.ontrack = gotRemoteStream;
    window.peerConnection.addStream(localStream);

}

function getUserMediaError(error) {
    alert("Failed to access to camera");
};

function createdDescription(description) {
    console.log('createdDescription: ' + description);

    window.peerConnection.setLocalDescription(description).then(function() {

        $.ajax({
	        method: "GET",
	    	url: "/voip/call/sdp",
	    	data: { call: call_id, sdp: JSON.stringify({'sdp': peerConnection.localDescription}) },
            success: function(data) {

            }
        });

    }).catch(errorHandler);
}

function gotIceCandidate(event) {
    if(event.candidate != null) {
		console.log("Got Ice Candidate: " + event.candidate);

        $.ajax({
	        method: "GET",
	    	url: "/voip/call/ice",
	    	data: { call: call_id, ice: JSON.stringify({'ice': event.candidate}) },
            success: function(data) {

            }
        });
    }
}

function gotRemoteStream(event) {
    console.log("Got Remote Stream: " + event.streams[0]);
    remoteVideo.srcObject = event.streams[0];
    remoteStream = event.streams[0];

    var startDate = new Date();

    //For video calls (2 streams) this get called twice so we use time difference as a work around
    var call_interval = setInterval(function() {
		var endDate   = new Date();
		var seconds = (endDate.getTime() - startDate.getTime()) / 1000;

        $("#voip_text").html( Math.round(seconds) + " seconds");
    }, 1000);

    $.ajax({
	    method: "GET",
		url: "/voip/call/begin",
		data: { call: call_id },
        success: function(data) {

        }
    });
}

$(document).on('click', '#voip_end_call', function(){

    $.ajax({
	    method: "GET",
		url: "/voip/call/end",
		data: { call: call_id },
        success: function(data) {

        }
    });

});

$(document).on('click', '#voip_full_screen', function(){
    $(".s-voip-manager").css("width","calc(100vw - 20px)");
    $(".s-voip-manager").css("height","calc(100vh - 20px)");
    $(".s-voip-manager").css("left","0px");
    $(".s-voip-manager").css("top","0px");
    $(".s-voip-manager").css("margin","10px");
    $(".s-voip-manager").css("resize","none");
    $("#remoteVideo").css("width","auto");
});

var VoipCallOutgoingNotification = Notification.extend({
    template: "VoipCallOutgoingNotification",

    init: function(parent, title, text, call_id) {
        this._super(parent, title, text, true);
    },
    start: function() {
        myNotif = this;
        this._super.apply(this, arguments);
        secondsLeft = countdown;
        $("#callsecondsoutgoingleft").html(secondsLeft);

        var outgoing_ring_interval = setInterval(function() {
            $("#callsecondsoutgoingleft").html(secondsLeft);
            if (secondsLeft == 0) {
				myNotif.rpc("/voip/missed/" + call_id);
				clearInterval(outgoing_ring_interval);
                myNotif.destroy(true);
            }

            secondsLeft--;
        }, 1000);

    },
});

var VoipCallIncomingNotification = Notification.extend({
    template: "VoipCallIncomingNotification",

    init: function(parent, title, text, call_id) {
        this._super(parent, title, text, true);


        this.events = _.extend(this.events || {}, {
            'click .link2accept': function() {
                this.rpc("/voip/accept/" + call_id);
                mySound.pause();
                mySound.currentTime = 0;
                this.destroy(true);
            },

            'click .link2reject': function() {
				this.rpc("/voip/reject/" + call_id);
                mySound.pause();
                mySound.currentTime = 0;
                this.destroy(true);
            },
        });
    },
    start: function() {
        myNotif = this;
        this._super.apply(this, arguments);
        secondsLeft = countdown;
        $("#callsecondsincomingleft").html(secondsLeft);

        var incoming_ring_interval = setInterval(function() {
            $("#callsecondsincomingleft").html(secondsLeft);
            if (secondsLeft == 0) {
				myNotif.rpc("/voip/missed/" + call_id);
                mySound.pause();
                mySound.currentTime = 0;
                clearInterval(incoming_ring_interval);
                myNotif.destroy(true);
            }

            secondsLeft--;
        }, 1000);

    },
});


});