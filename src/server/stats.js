var allUserAgents = {};
var submittedOps = [];
var broadcastEvents = [];

module.exports = {
    /**
     * Start tracking the user agent by ID
     *
     * @param id
     * @param agent
     */
    addUserAgent : function(id, agent) {
        allUserAgents[id] = agent;
    },

    /**
     * Stop tracking the user agent of the ID passed in
     *
     * @param id
     */
    removeUserAgent : function(id) {
        delete allUserAgents[id];
    },

    /**
     * Get the number of connected user agents (open connections to sharejs)
     *
     * @returns {number}
     */
    getUserAgentCount : function() {
        var count = 0;
        for(var userAgentKey in allUserAgents) {
            if (allUserAgents.hasOwnProperty(userAgentKey)) {
                count++;
            }
        }
        return count;
    },

    /**
     * Get the number of open docs by adding up the number of listeners for all tracked user agents
     *
     * @returns {number}
     */
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

    /**
     * An op was just submitted. Add a new timestamp to the tracking array. Add it at the beginning so
     * that we can easily truncate old values later.
     */
    addSubmittedOp : function() {
        var currentTime = new Date().getTime();
        submittedOps.unshift(currentTime);

        // We want to prevent the tracking array from getting too large, so if the last element is over a minute old, remove it
        var oneMinuteAgo = currentTime - 1000;
        if(submittedOps[submittedOps.length - 1] < oneMinuteAgo) {
            submittedOps.pop();
        }
    },

    /**
     * Get the number of submitted ops. If interval is not specified, get all. If interval is specified, return
     * the number within that amount of time and then truncate older values off.
     *
     * @param interval - milliseconds
     * @returns {Number}
     */
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

    /**
     * An event was just broadcast. Add a new timestamp to the tracking array. Add it at the beginning so
     * that we can easily truncate old values later.
     */
    addBroadcastEvent : function() {
        var currentTime = new Date().getTime();
        broadcastEvents.unshift(currentTime);

        // We want to prevent the tracking array from getting too large, so if the last element is over a minute old, remove it
        var oneMinuteAgo = currentTime - 1000;
        if(broadcastEvents[broadcastEvents.length - 1] < oneMinuteAgo) {
            broadcastEvents.pop();
        }
    },

    /**
     * Get the number of broadcast events. If interval is not specified, get all. If interval is specified, return
     * the number within that amount of time and then truncate older values off.
     *
     * @param interval - milliseconds
     * @returns {Number}
     */
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