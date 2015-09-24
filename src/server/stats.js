var allUserAgents = {};
var submittedOps = [];
var broadcastEvents = [];

module.exports = {
    addUserAgent : function(id, agent) {
        allUserAgents[id] = agent;
    },

    removeUserAgent : function(id) {
        delete allUserAgents[id];
    },

    getOpenDocCount : function() {
        var count = 0;
        for(var userAgentKey in allUserAgents) {
            if (allUserAgents.hasOwnProperty(userAgentKey)) {
                var userAgent = allUserAgents[userAgentKey];
                count += userAgent.getListenersCount();
            }
        }
        return count;
    },

    addSubmittedOp : function() {
        submittedOps.unshift(new Date().getTime());
    },

    getSubmittedOpCount : function(interval) {
        if(interval && submittedOps.length > 0) {
            var time = new Date().getTime();
            var intervalStart = time - interval;

            for (var i = 0; i < submittedOps.length; i++) {
                if (submittedOps[i] < intervalStart) {
                    submittedOps.length = i;
                    break;
                }
            }
        }

        return submittedOps.length;
    },

    addBroadcastEvent : function() {
        broadcastEvents.unshift(new Date().getTime());
    },

    getBroadcastEventCount : function(interval) {
        if(interval && broadcastEvents.length > 0) {
            var time = new Date().getTime();
            var intervalStart = time - interval;

            for (var i = 0; i < broadcastEvents.length; i++) {
                if (broadcastEvents[i] < intervalStart) {
                    broadcastEvents.length = i;
                    break;
                }
            }
        }

        return broadcastEvents.length;
    }
};