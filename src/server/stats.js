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
        for(var userAgent in allUserAgents) {
            var agentListeners = userAgent.getListeners();
            count += agentListeners.length;
        }
        return count;
    }
};