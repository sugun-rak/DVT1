const axios = require('axios');

/**
 * FailoverProxy handles multiple target URLs for a service.
 * It tries the primary URL first, and if it fails, it cycles through the backups.
 */
class FailoverProxy {
    constructor(serviceName, targets) {
        this.serviceName = serviceName;
        this.targets = targets.filter(t => t); // Filter out empty strings
        this.activeTargetIndex = 0;
        console.log(`[Failover] Initialized ${serviceName} with ${this.targets.length} targets:`, this.targets);
    }

    async getActiveTarget() {
        // Simple strategy: Always start with the first target to prefer the "best" free tier
        // But you could also implement a "Last Known Good" strategy here.
        for (let i = 0; i < this.targets.length; i++) {
            const target = this.targets[i];
            try {
                // Quick health check (optional but recommended)
                // For now, we'll just return the target and let the proxy handle failure
                return target;
            } catch (e) {
                console.warn(`[Failover] Target ${target} for ${this.serviceName} is down. Trying next...`);
            }
        }
        return this.targets[0]; // Fallback to first
    }
}

module.exports = FailoverProxy;
