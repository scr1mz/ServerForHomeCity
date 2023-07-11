const db = require('../db')

class ObjectController{
    //Добавление объекта
    async createObject(req, res) {
        try {
            const users = await db.query(
                `SELECT id FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad id or token' });
            }

            const {
                description, price, address, status,
                property_type, rooms, area, floor, total_floors,
                latitude, longitude,
                bathroom_type,
                bathrooms_count,
                loggias_count,
                repair_type,
                building_type,
                elevators_count,
                has_cargo_elevator,
                has_parking,
                has_electricity,
                has_gas,
                has_water
            } = req.body;
            if (!price || !address || !status || !property_type) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            //Запрос на добавление к таблице object
            const objects = await db.query(
                `INSERT INTO objects (
                    description, price, address, status, date_added,
                    property_type, rooms, area, floor, total_floors,
                    category,
                    latitude, longitude,
                    bathroom_type,
                    bathrooms_count,
                    loggias_count,
                    repair_type,
                    building_type,
                    elevators_count,
                    has_cargo_elevator,
                    has_parking,
                    has_electricity,
                    has_gas,
                    has_water
                )
                    VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, 'draft', $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
                    RETURNING id`,
                [
                    description, price, address, status,
                    property_type, rooms, area, floor, total_floors,
                    latitude, longitude,
                    bathroom_type,
                    bathrooms_count,
                    loggias_count,
                    repair_type,
                    building_type,
                    elevators_count,
                    has_cargo_elevator,
                    has_parking,
                    has_electricity,
                    has_gas,
                    has_water
                ]
            );
            if (objects.rowCount !== 1) {
                return res.status(404).json({ error: 'Unexpected error' })
            }

            //Запрос на добавление к таблице ownership
            const ownerships = await db.query(
                'INSERT INTO ownership (object_id, user_id) VALUES ($1, $2) RETURNING *',
                [objects.rows[0].id, users.rows[0].id]
            );
            if (ownerships.rowCount !== 1) {
                return res.status(404).json({ error: 'Unexpected error' })
            }

            res.json(objects.rows[0]);
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to create object' })
        }
    }

    //Добавление агента для объекта
    async addObjectAgent(req, res) {
        try {
            const objectId = req.params.object_id;
            const { agent_id } = req.body;

            // Проверяем, является ли пользователь агентом
            const agent = await db.query('SELECT * FROM users WHERE id = $1', [agent_id]);
            if (agent.rowCount === 0 || agent.rows[0].role !== 'agent') {
                return res.status(400).json({ error: 'The specified user is not an agent' });
            }

            // Обновляем агента для объекта
            const updatedOwnership = await db.query(
                'UPDATE ownership SET agent_id = $1 WHERE object_id = $2 RETURNING *', [agent_id, objectId]);
            if (updatedOwnership.rowCount === 0) {
                return res.status(404).json({ error: 'Object not found' });
            }
            res.json(updatedOwnership.rows[0]);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to add agent to object' });
        }
    }

    //Получение объектов
    async getObjects(req, res) {
        try {
            const id = parseInt(req.query.id) || 0;
            const limit = parseInt(req.query.limit) || 30;
            const filter = req.query.filter || {};
            const bbox = req.query.bbox;
            const callback = req.query.callback;

            const conditions = [];
            const values = [];

            if (filter.query !== undefined && filter.query !== "") {
                conditions.push(`(o.address LIKE $${values.length + 1} OR o.description LIKE $${values.length + 1})`);
                values.push(`%${filter.query}%`);
            }

            const fromToNames = [
                "price", "rooms", "area", "floor", "total_floors"
            ]

            for (const name of fromToNames) {
                const from = filter[`${name}_from`]
                if (from !== undefined) {
                    conditions.push(`o.${name} >= $${values.length + 1}`);
                    values.push(parseInt(from));
                }

                const to = filter[`${name}_to`]
                if (to !== undefined) {
                    conditions.push(`o.${name} <= $${values.length + 1}`);
                    values.push(parseInt(to));
                }
            }

            if (filter.property_type !== undefined) {
                conditions.push(`o.property_type = $${values.length + 1}`);
                values.push(filter.property_type);
            }

            const users = await db.query(
                `SELECT * FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )

            if (filter.created_by_me) {
                if (users.rowCount === 0) {
                    return res.json([])
                }
                conditions.push(`own.user_id = $${values.length + 1}`)
                values.push(users.rows[0].id)
            }

            const categories = [];
            if (users.rowCount === 0) {
                if (filter.categories && filter.categories.length) {
                    return res.status(400).json({ error: 'Bad filter' })
                }
                categories.push("approved")
            } else {
                if (["admin", "moderator"].indexOf(users.rows[0].role) !== -1) {
                    if (filter.categories && filter.categories.length) {
                        categories.push(...filter.categories)
                    } else {
                        if (!filter.created_by_me) {
                            categories.push("approved")
                        }
                    }
                } else {
                    if (filter.categories && filter.categories.length) {
                        if (!filter.created_by_me) {
                            return res.status(400).json({ error: 'Bad filter' });
                        }
                        categories.push(...filter.categories)
                    } else {
                        if (!filter.created_by_me) {
                            categories.push("approved")
                        }
                    }
                }
            }
            if (categories.length) {
                conditions.push(`o.category IN (${categories.map((item, index) => `$${values.length + 1 + index}`).join(", ")})`)
                values.push(...categories)
            }

            if (bbox === undefined && id) {
                conditions.push(`o.id > $${values.length + 1}`)
                values.push(id);
            }

            let limitSuffix = ""
            if (bbox === undefined) {
                values.push(limit)
                limitSuffix = ` LIMIT $${values.length}`
            } else {
                conditions.push(
                    `o.latitude >= $${values.length + 1} AND o.longitude >= $${values.length + 2} AND
                    o.latitude < $${values.length + 3} AND o.longitude < $${values.length + 4}`
                )
                values.push(...bbox.split(","))
            }

            const sql = `SELECT o.*, own.user_id, own.agent_id
                FROM objects o
                JOIN ownership own ON o.id = own.object_id
                WHERE ${conditions.join(" AND ")}
                ORDER BY o.id ASC` + limitSuffix

            const objects = await db.query(
                sql,
                values
            );

            if (bbox) {
                const data = JSON.stringify(
                    {
                        error: null,
                        data: {
                            type: "FeatureCollection",
                            features: objects.rows.map(
                                item => ({
                                    type: "Feature",
                                    id: item.id,
                                    geometry: {
                                        type: "Point",
                                        coordinates: [item.latitude, item.longitude]
                                    }
                                })
                            )
                        }
                    }
                )
                res.type(".js").send(`${callback}(${data});`)
            } else {
                const objectImagesPromises = objects.rows.map(async (object) => {
                    const images = await db.query(
                        'SELECT * FROM object_images WHERE object_id = $1 ORDER BY id',
                        [object.id]
                    );
                    return {
                        ...object,
                        images: images.rows
                    };
                });

                const objectsWithImages = await Promise.all(objectImagesPromises);

                res.json(objectsWithImages);
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to get objects' });
        }
    }

    async getOneObject(req, res) {
        try {
            const id = req.params.id;
            const oneObject = await db.query(
                `SELECT o.*, own.user_id, own.agent_id
             FROM objects o
             JOIN ownership own ON o.id = own.object_id
             WHERE o.id = $1`, [id]
            );
            if (oneObject.rowCount === 0) {
                return res.status(404).json({error: 'Object not found'});
            }

            // Fetch images for the object
            const images = await db.query(
                'SELECT * FROM object_images WHERE object_id = $1 ORDER BY id',
                [id]
            );

            // Add images to the object
            const objectWithImages = {
                ...oneObject.rows[0],
                images: images.rows
            };

            res.json(objectWithImages);
        } catch (error) {
            console.error(error);
            res.status(500).json({error: 'Failed to get object'});
        }
    }

    //Получение информации о том, кто владелец и агент (если есть)
    async getObjectOwnership(req, res) {
        try {
            const objectId = req.params.object_id;
            const ownership = await db.query(
                `SELECT * FROM ownership WHERE object_id = $1`,
                [objectId]
            );
            if (ownership.rowCount === 0) {
                return res.status(404).json({ error: 'Ownership information not found' });
            }
            res.json(ownership.rows[0]);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to get ownership information' });
        }
    }

    async updateObject(req, res) {
        try {
            const users = await db.query(
                `SELECT id FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad id or token' });
            }

            const {
                id,
                description, price, address, status,
                property_type, rooms, area, floor, total_floors,
                latitude, longitude,
                bathroom_type,
                bathrooms_count,
                loggias_count,
                repair_type,
                building_type,
                elevators_count,
                has_cargo_elevator,
                has_parking,
                has_electricity,
                has_gas,
                has_water
            } = req.body;
            if (!price || !address || !status || !property_type) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const ownerships = await db.query(
                'SELECT * FROM ownership WHERE object_id = $1 AND user_id = $2',
                [id, users.rows[0].id]
            );
            if (ownerships.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad user' });
            }

            const updObject = await db.query(
                `UPDATE objects
                    SET
                        description = $1,
                        price = $2,
                        address = $3,
                        status = $4,
                        property_type = $5,
                        rooms = $6,
                        area = $7,
                        floor = $8,
                        total_floors = $9,
                        latitude = $10,
                        longitude = $11,
                        category = CASE
                            WHEN category = 'approved' THEN 'checking'
                            ELSE category
                        END,
                        bathroom_type = $13,
                        bathrooms_count = $14,
                        loggias_count = $15,
                        repair_type = $16,
                        building_type = $17,
                        elevators_count = $18,
                        has_cargo_elevator = $19,
                        has_parking = $20,
                        has_electricity = $21,
                        has_gas = $22,
                        has_water = $23
                    WHERE id = $12 RETURNING *`,
                [
                    description, price, address, status,
                    property_type, rooms, area, floor, total_floors,
                    latitude, longitude,
                    id,
                    bathroom_type,
                    bathrooms_count,
                    loggias_count,
                    repair_type,
                    building_type,
                    elevators_count,
                    has_cargo_elevator,
                    has_parking,
                    has_electricity,
                    has_gas,
                    has_water
                ]
            );
            if (updObject.rowCount === 0) {
                return res.status(404).json({error: 'Object not found'});
            }
            res.json(updObject.rows[0]);
        } catch (error) {
            console.error(error);
            res.status(500).json({error: 'Failed to update object'});
        }
    }

    async updateObjectAgent(req, res) {
        try {
            const {id, agent_id} = req.body;
            // Проверяем, является ли пользователь агентом
            const agent = await db.query('SELECT * FROM users WHERE id = $1', [agent_id]);
            if (agent.rowCount === 0 || agent.rows[0].role !== 'agent') {
                return res.status(400).json({ error: 'The specified user is not an agent' });
            }
            // Обновляем агента для объекта
            const updatedOwnership = await db.query(
                'UPDATE ownership SET agent_id = $1 WHERE object_id = $2 RETURNING *', [agent_id, id]);
            if (updatedOwnership.rowCount === 0) {
                return res.status(404).json({ error: 'Object not found' });
            }
            res.json(updatedOwnership.rows[0]);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to update agent for object' });
        }
    }

    async deleteObject(req, res) {
        try {
            const users = await db.query(
                `SELECT id FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad id or token' });
            }

            const id = req.params.id

            const ownerships = await db.query(
                'SELECT * FROM ownership WHERE object_id = $1 AND user_id = $2',
                [id, users.rows[0].id]
            );
            if (ownerships.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad user' });
            }

            // Удаляем записи из таблицы "object_images"
            await db.query('DELETE FROM object_images WHERE object_id = $1', [id]);

            // Удаляем записи из таблицы "ownership"
            await db.query('DELETE FROM ownership WHERE object_id = $1', [id]);

            await db.query('DELETE FROM purchases WHERE object_id = $1', [id]);

            // Удаляем запись из таблицы "objects"
            const delObject = await db.query('DELETE FROM objects WHERE id = $1', [id]);

            if (delObject.rowCount === 0) {
                return res.status(404).json({ error: 'Object not found' });
            }
            res.status(200).json({ message: 'Object deleted successfully' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to delete object' });
        }
    }

    async updateObjectCategory(req, res) {
        try {
            const users = await db.query(
                `SELECT * FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad id or token' });
            }
            const {role, id: user_id} = users.rows[0];

            const { object_id } = req.params
            const { category } = req.body

            if (['admin', 'moderator'].indexOf(role) !== -1) {
                if (["approved", "rejected"].indexOf === -1) {
                    return res.status(400).json({ error: 'Bad category' });
                }
            } else {
                if (["draft", "checking", "archived"].indexOf(category) === -1) {
                    return res.status(400).json({ error: 'Bad category' });
                }
                const ownerships = await db.query(
                    'SELECT * FROM ownership WHERE object_id = $1 AND user_id = $2',
                    [object_id, user_id]
                );
                if (ownerships.rowCount !== 1) {
                    return res.status(403).json({ error: 'Bad user' });
                }
            }

            const client = await db.connect()

            try {
                await client.query('BEGIN')
                const objects = await client.query(`UPDATE objects SET category = $1 WHERE id = $2 AND category <> $3`, [category, object_id, category])
                if (objects.rowCount !== 1) {
                    await client.query('ROLLBACK')
                    return res.status(500).json({ error: 'Failed to update object category' });
                }
                let cost = 0;
                if (category === 'checking') {
                    cost = 100;
                } else if (category === 'rejected') {
                    cost = -100;
                }
                const updatedUsers = await client.query(`UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1`, [cost, user_id])
                if (updatedUsers.rowCount !== 1) {
                    await client.query('ROLLBACK')
                    return res.status(500).json({ error: 'Failed to update user balance' });
                }
                if (cost !== 0) {
                    await client.query(`INSERT INTO purchases (user_id, object_id, sum, date_time) VALUES ($1, $2, $3, NOW())`, [user_id, object_id, cost])
                }
                await client.query('COMMIT')
                res.json({ message: 'Object category updated successfully' })
            } catch (e) {
                await client.query('ROLLBACK')
                throw e
            } finally {
                client.release()
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to update object category' });
        }
    }

}
module.exports = new ObjectController()