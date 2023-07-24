const axios = require('axios')
const db = require('../db')
const {v4: uuid4} = require("uuid")
const nodemailer = require('nodemailer');

const URL = 'http://homecity32:3000'

const DADATA_KEY = 'Token ab2e74c24c054083402b19eb25de8c9fe597c92a'

const YOOKASSA_ID = '319895'
const YOOKASSA_KEY = 'test_7E_DSCwiim-wO2Ir0Vqsk3uuGuQHlnR3LO0-1ee10Is'

const transporter = nodemailer.createTransport({
    host: "mail.hostland.ru",
    port: 465,
    secure: true,
    auth: {
        user: 'homecity@game1vs100.ru',
        pass: 'dc911616-6457-4c6a-80b1-b245d9fab7be'
    }
});

class UtilsController  {
    async getLocations(req, res) {
        try {
            const {name} = req.body
            const response = await axios.post(
                'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
                {
                    query: name,
                    from_bound: { value: "city" },
                    to_bound: { value: "city" }
                },
                {
                    headers: {
                        'Authorization': DADATA_KEY
                    }
                }
            );
            return res.json(response.data.suggestions.map(
                item => ({name: item.data.city, coords: [item.data.geo_lat, item.data.geo_lon]})
            ))
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to get locations' })
        }
    }

    async getAddrs(req, res) {
        try {
            const {name, city} = req.body
            const response = await axios.post(
                'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
                {
                    query: name,
                    locations: { city },
                    restrict_value: true
                },
                {
                    headers: {
                        'Authorization': DADATA_KEY
                    }
                }
            );
            return res.json(response.data.suggestions.map(
                item => ({name: item.value, coords: [item.data.geo_lat, item.data.geo_lon]})
            ))
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to get addrs' })
        }
    }

    async refill(req, res) {
        try {
            const users = await db.query(
                `SELECT id FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad id or token' })
            }

            const {sum} = req.body
            const response = await axios.post(
                'https://api.yookassa.ru/v3/payments',
                {
                    "amount": {
                      "value": sum,
                      "currency": "RUB"
                    },
                    "capture": true,
                    "confirmation": {
                        "type": "redirect",
                        "return_url": `${URL}/profile`
                    },
                    "description": `Пополнение счета ${req.cookies.email}`
                },
                {
                    headers: {
                        "Idempotence-Key": uuid4()
                    },
                    auth: {
                        username: YOOKASSA_ID,
                        password: YOOKASSA_KEY
                    }
                }
            )
            await db.query(
                `INSERT INTO payments (user_id, sum, payment_id, pending, date_time)
                    VALUES ($1, $2, $3, TRUE, NOW()) RETURNING id`,
                [users.rows[0].id, sum, response.data.id]
            )
            return res.json({url: response.data.confirmation.confirmation_url})
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to refill' })
        }
    }

    async updateBalance(user_id) {
        const payments = await db.query(
            `SELECT id, payment_id FROM payments WHERE pending AND user_id = $1`,
            [user_id]
        )
        for (const row of payments.rows) {
            try {
                const response = await axios.get(
                    `https://api.yookassa.ru/v3/payments/${row.payment_id}`,
                    {
                        auth: {
                            username: YOOKASSA_ID,
                            password: YOOKASSA_KEY
                        }
                    }
                )
                if (response.data.status === "succeeded") {
                    await db.query(
                        `SELECT accept_payment($1)`,
                        [row.id]
                    )
                } else if (response.data.status === "canceled") {
                    await db.query(
                        `DELETE FROM payments WHERE id = $1`,
                        [row.id]
                    )
                }
            } catch (error) {
                console.error(error);
            }
        }
    }

    async sendMail(mailOptions) {
        return await transporter.sendMail(mailOptions)
    }

}
module.exports = new UtilsController()