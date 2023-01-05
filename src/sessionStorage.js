const sessions = new Map();

export function findSession(id) {
    return sessions.get(id);
}

export function saveSession(id, session) {
    sessions.set(id, session);
}

export function findAllSession() {
    return [...sessions.values()];
}