var lastStatsPoll = new Date().getTime();
var allUserAgents = {};
var submittedOps = [];
var broadcastEvents = [];

module.exports = {
    /**
     * Poll the stats. For the submitted ops and broadcast events, calculate the count per second by taking
     * the number since the last poll and divide by the seconds since the last poll.
     *
     * @returns {{
     *      openConnectionCount: number,
     *      openDocCount: number,
     *      submittedOpsPerSec: Number,
     *      broadcastEventsPerSec: Number
     * }}
     */
    pollStats : function() {
        var submittedOpsPerSec = this.flushSubmittedOps();
        var broadcastEventsPerSec = this.flushBroadcastEvents();

        // Get the data per second by figuring out the number of seconds since the last poll
        // and dividing the data by it
        var pollTime = new Date().getTime();
        var secondsSinceLastPoll = (pollTime - lastStatsPoll) / 1000;
        if(secondsSinceLastPoll > 0) {
            submittedOpsPerSec    = submittedOpsPerSec / secondsSinceLastPoll;
            broadcastEventsPerSec = broadcastEventsPerSec / secondsSinceLastPoll;
        }

        // Track this as the last poll time
        lastStatsPoll = pollTime;

        return {
            openConnectionCount   : this.getUserAgentCount(),
            openDocCount          : this.getOpenDocCount(),
            submittedOpsPerSec    : submittedOpsPerSec,
            broadcastEventsPerSec : broadcastEventsPerSec
        };
    },

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
     * Get the number of submitted ops since the last time it was polled. Get the number and then truncate the array.
     *
     * @returns {Number}
     */
    flushSubmittedOps : function() {
        var count = submittedOps.length;
        submittedOps = [];

        return count;
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
     * Get the number of broadcast events since the last time it was polled. Get the number and then truncate the array.
     *
     * @returns {Number}
     */
    flushBroadcastEvents : function() {
        var count = broadcastEvents.length;
        broadcastEvents = [];

        return count;
    }
};