
module.exports = async function (context, req) {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        context.res = {
            status: 400,
            body: { error: 'Username, password, and role required' }
        };
        return;
    }

   
    const user = {
        id: Date.now().toString(),
        username,
        role,
        token: Buffer.from(`${username}:${Date.now()}`).toString('base64')
    };

    context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { user }
    };
};

