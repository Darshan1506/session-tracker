async function createRepository(token, name, description, isPrivate) {
    try {
        const response = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                Authorization: `token ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VSCode-Activity-Tracker'
            },
            body: JSON.stringify({
                name,
                description,
                private: isPrivate,
                auto_init: true
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to create repository');
        }

        const repo = await response.json();
        return repo.clone_url;
    } catch (error) {
        console.error('Error creating repository:', error);
        throw error; 
    }
}

module.exports = { createRepository };
