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
        return submittedOps.length;
    },

    addBroadcastEvent : function() {
        broadcastEvents.unshift(new Date().getTime());
    },

    getBroadcastEventCount : function(interval) {
        return broadcastEvents.length;
    }
};