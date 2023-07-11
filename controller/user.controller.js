const db = require('../db')
const {v4: uuid4} = require("uuid")
const crypto = require("crypto")
const utilsController = require ('./utils.controller')

const md5 = data => crypto.createHash("md5").update(data).digest("hex")

const SALT = "316f312c-713a-4724-b371-4a8392e8e768";

function isValidRole(role) {
    return ['user', 'admin', 'agent'].includes(role);
}

class UserController  {
    async createUser(req, res) {
        try {
            const role = 'user'
            const {full_name, phone, email, password} = req.body
            if (!full_name || !phone || !email || !password) {
                return res.status(400).json({ error: 'Bad params' });
            }
            const token = uuid4()
            const users = await db.query(
                `INSERT INTO users (role, full_name, phone, email, password_hash, token)
                    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [role, full_name, phone, email, md5(password + SALT), token]
            )
            if (users.rowCount === 0) {
                return res.status(404).json({ error: 'Unexpected error' })
            }
            res.json({id: users.rows[0].id, token, info: {role, full_name}})
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to create user' })
        }
    }

    async getUsers(req, res) {
        try {
            const users = await db.query(
                `SELECT * FROM users
                    WHERE id = $1 AND token = $2 AND role = 'admin'`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad id or password' })
            }
            const id = parseInt(req.query.id) || 0;
            const limit = parseInt(req.query.limit) || 30;
            const filter = req.query.filter || {};
            const result = await db.query(
                `SELECT id, phone, role, full_name, email
                    FROM users
                    WHERE id > $1 AND (
                        email LIKE $2 OR
                        full_name LIKE $2 OR
                        phone LIKE $2
                    )
                    ORDER BY id ASC
                    LIMIT $3`,
                [id, `%${filter.query || ""}%`, limit]
            )
            res.json(result.rows)
        } catch (error) {
            console.error(error)
            res.status(500).json({error: 'Failed to get users'})
        }
    }

    async getOneUser(req, res){
        try {
            const id = req.params.id
            const oneUser = await db.query(`SELECT * FROM users where id = $1`, [id])
            if (oneUser.rowCount === 0) {
                return res.status(404).json({ error: 'User not found' })
            }
            res.json(oneUser.rows[0])
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to get user' })
        }
    }

    async updateUser(req, res) {
        const { id, phone, role, full_name, email} = req.body;

        const updates = [];
        const values = [];

        if (role && isValidRole(phone)) {
            updates.push('phone = $' + (values.length + 1));
            values.push(phone);
        }

        if (role && isValidRole(role)) {
            updates.push('role = $' + (values.length + 1));
            values.push(role);
        }

        if (full_name) {
            updates.push('full_name = $' + (values.length + 1));
            values.push(full_name);
        }

        if (email) {
            updates.push('email = $' + (values.length + 1));
            values.push(email);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`;

        try {
            const result = await db.query(query, values);
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to update user' });
        }
    }

    async updateUserRole(req, res) {
        try {
            const users = await db.query(
                `SELECT * FROM users
                    WHERE id = $1 AND token = $2 AND role = 'admin'`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad id or password' })
            }

            const { id } = req.params
            const { role } = req.body
            const validRoles = ['user', 'admin', 'agent', 'moderator']
            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: 'Invalid role' })
            }
            const updUser = await db.query(
                `UPDATE users SET role = $1 WHERE id = $2 RETURNING *`,
                [role, id]
            )
            if (updUser.rowCount === 0) {
                return res.status(404).json({ error: 'User not found' })
            }
            res.status(200).json({message: 'User role updated successfully'})
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to update user role' })
        }
    }

    async deleteUser(req, res) {
        const id = req.params.id
        try {
            const delUser = await db.query('DELETE FROM users where id = $1', [id])
            if (delUser.rowCount === 0) {
                return res.status(404).json({error: 'User not found'})
            } else
                res.status(200).json({message: 'User deleted successfully'})
        } catch (error) {
            console.error(error)
            res.status(500).json({error: 'Failed to delete user'})
        }
    }

    async setToken(req, res) {
        try {
            const {email, password} = req.body
            const passwordHash = md5(password + SALT)
            const users = await db.query(
                `SELECT * FROM users WHERE email = $1`,
                [email]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad email or password' })
            }
            if (users.rows[0].password_hash !== passwordHash && users.rows[0].one_time_password_hash !== passwordHash) {
                return res.status(403).json({ error: 'Bad email or password' })
            }
            const token = uuid4()
            await db.query(
                `UPDATE users SET token = $1, one_time_password_hash = ''
                    WHERE id = $2`,
                [token, users.rows[0].id]
            )
            res.json({id: users.rows[0].id, token, info: {role: users.rows[0].role, full_name: users.rows[0].full_name}})
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to set token' })
        }
    }

    async refreshToken(req, res) {
        try {
            if (req.cookies.id === undefined || req.cookies.token === undefined) {
                res.json({ success: false, error: 'bad id or token' });
                return;
            }
            const token = uuid4()
            const users = await db.query(
                `UPDATE users SET token = $1
                    WHERE id = $2 AND token = $3 RETURNING role, full_name`,
                [token, req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                res.json({ success: false, error: 'bad id or token' });
                return;
            }
            res.json({success: true, token, info: {role: users.rows[0].role, full_name: users.rows[0].full_name}})
        } catch (error) {
            console.error(error)
            res.json({ success: false, error: 'failed to refresh token' });
        }
    }

    async deleteToken(req, res) {
        try {
            const updatedEmails = await db.query(
                `UPDATE users SET token = $1
                    WHERE id = $2 AND token = $3`,
                ["", req.cookies.id, req.cookies.token]
            )
            if (updatedEmails.rowCount !== 1) {
                res.status(403).json({ error: 'Bad id or token' });
                return;
            }
            res.status(200).json({message: 'Token deleted successfully'})
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to delete token' })
        }
    }

    async getProfile(req, res) {
        try {
            let users = await db.query(
                `SELECT id FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad id or token' });
            }
            await utilsController.updateBalance(req.cookies.id)
            users = await db.query(
                `SELECT full_name, phone, email, balance FROM users
                    WHERE id = $1`,
                [req.cookies.id]
            )
            res.json(users.rows[0])
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to get profile' })
        }
    }

    async updateProfile(req, res) {
        const { phone, password, full_name, email} = req.body;

        const updates = [];
        const values = [];

        if (phone) {
            updates.push('phone = $' + (values.length + 1));
            values.push(phone);
        }

        if (password) {
            updates.push('password_hash = $' + (values.length + 1));
            values.push(md5(password + SALT));
        }

        if (full_name) {
            updates.push('full_name = $' + (values.length + 1));
            values.push(full_name);
        }

        if (email) {
            updates.push('email = $' + (values.length + 1));
            values.push(email);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(req.cookies.id);
        values.push(req.cookies.token);
        const query = `UPDATE users SET ${updates.join(', ')}
            WHERE id = $${values.length - 1} AND token = $${values.length}
            RETURNING role, full_name`;

        try {
            const users = await db.query(query, values);
            if (users.rowCount !== 1) {
                return res.status(500).json({ error: 'Failed to update profile' });
            }
            res.json({info: users.rows[0]});
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to update profile' });
        }
    }

    async sendOneTimePassword(req, res) {
        try {
            const { email } = req.body;
            const oneTimePassword = uuid4()
            const users = await db.query(
                `UPDATE users SET one_time_password_hash = $1
                    WHERE email = $2 RETURNING *`,
                [md5(oneTimePassword + SALT), email]
            )
            if (users.rowCount !== 1) {
                return res.status(500).json({ error: 'Failed to send one-time password' })
            }

            await utilsController.sendMail({
                from: 'homecity@game1vs100.ru',
                to: email,
                subject: 'HomeCity one-time password',
                text: `Your one-time password is ${oneTimePassword}`
            })

            res.status(200).json({message: 'One-time password send successfully'})
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to send one-time password' })
        }
    }

    async getUserPayments(req, res) {
        try {
            const id = parseInt(req.params.id)
            const users = await db.query(
                `SELECT * FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1 || (users.rows[0].id !== id && users.rows[0].id !== 'admin')) {
                return res.status(403).json({ error: 'Bad id or password' })
            }
            const payments = await db.query(
                `SELECT id, date_time, sum, pending FROM payments WHERE user_id = $1 ORDER BY id DESC`,
                [users.rows[0].id]
            )
            res.json(payments.rows)
        } catch (error) {
            console.error(error)
            res.status(500).json({error: 'Failed to get user payments'})
        }
    }

    async getUserPurchases(req, res) {
        try {
            const id = parseInt(req.params.id)
            const users = await db.query(
                `SELECT * FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1 || (users.rows[0].id !== id && users.rows[0].id !== 'admin')) {
                return res.status(403).json({ error: 'Bad id or password' })
            }
            const purchases = await db.query(
                `SELECT id, date_time, sum, object_id FROM purchases WHERE user_id = $1 ORDER BY id DESC`,
                [users.rows[0].id]
            )
            res.json(purchases.rows)
        } catch (error) {
            console.error(error)
            res.status(500).json({error: 'Failed to get user purchases'})
        }
    }

}
module.exports = new UserController()