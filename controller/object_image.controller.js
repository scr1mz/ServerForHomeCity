const db = require('../db')
const fs = require('fs')
const path = require('path')

function deleteFile(filePath) {
    fs.unlink(path.join(__dirname, filePath), (err) => {
        if (err) {
            console.error('Error deleting file:', err)
        } else {
            console.log('File deleted:', filePath)
        }
    })
}

class ObjectImageController {
    async uploadImage(req, res) {
        try {
            const users = await db.query(
                `SELECT id FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad id or token' });
            }

            const object_id = req.params.id

            const ownerships = await db.query(
                'SELECT * FROM ownership WHERE object_id = $1 AND user_id = $2',
                [object_id, users.rows[0].id]
            );
            if (ownerships.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad user' });
            }

            const imagePath = req.file.path
            // Сохранить путь к изображению в вашей базе данных, связав его с объектом по `object_id`
            const newImage = await db.query(
                `INSERT INTO object_images (object_id, image_url) values ($1, $2) RETURNING *`,
                [object_id, imagePath]
            )
            res.status(200).json({ message: 'Image uploaded successfully', image: newImage.rows[0] })
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to upload image' })
        }
    }

    async getImagesForObject(req, res) {
        try {
            const object_id = req.params.id

            // Получить все изображения для данного объекта
            const images = await db.query('SELECT * FROM object_images WHERE object_id = $1 ORDER BY id', [object_id])

            res.status(200).json(images.rows)
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to get images for object' })
        }
    }

    async deleteImage(req, res) {
        try {
            const users = await db.query(
                `SELECT id FROM users
                    WHERE id = $1 AND token = $2`,
                [req.cookies.id, req.cookies.token]
            )
            if (users.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad id or token' });
            }

            const object_id = req.params.object_id

            const ownerships = await db.query(
                'SELECT * FROM ownership WHERE object_id = $1 AND user_id = $2',
                [object_id, users.rows[0].id]
            );
            if (ownerships.rowCount !== 1) {
                return res.status(403).json({ error: 'Bad user' });
            }

            const id = req.params.id

            // Найти изображение объекта в базе данных
            const image = await db.query('SELECT * FROM object_images WHERE id = $1', [id])

            if (image.rowCount === 0) {
                return res.status(404).json({ error: 'Image not found' });
            } else if (image.rows[0].object_id !== parseInt(object_id, 10)) {
                // Если object_id не совпадает с object_id в записи изображения
                return res.status(403).json({ error: 'Image does not belong to the specified object' });
            } else {
            // Удалить информацию об изображении из базы данных
            const deletedImage = await db.query('DELETE FROM object_images WHERE id = $1 RETURNING *', [id])
                // Удалить файл изображения с сервера
                deleteFile(`../${image.rows[0].image_url}`)
                res.status(200).json({ message: 'Image deleted successfully' })
            }
        } catch (error) {
            console.error(error)
            res.status(500).json({ error: 'Failed to delete image' })
        }
    }
}

module.exports = new ObjectImageController();