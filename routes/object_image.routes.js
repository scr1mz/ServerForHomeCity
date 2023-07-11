const Router = require('express')
const router = new Router()
const objectImageController = require('../controller/object_image.controller')
const upload = require('../controller/multerConfig');

router.post('/object/:id/image', upload.single('image'), objectImageController.uploadImage)
router.get('/object/:id/images', objectImageController.getImagesForObject)
router.delete('/object/:object_id/image/:id', objectImageController.deleteImage)


module.exports = router
