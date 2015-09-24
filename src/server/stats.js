var allUserAgents = {};

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
    }
};