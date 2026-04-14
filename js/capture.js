/* global cv */
export const Capture = {
    videoEl: null,
    canvasEl: null,
    ctx: null,
    stream: null,
    boxes: [], // [{x, y, w, h, isCircle: true}]
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentImage: null,
    isAutoDetecting: true,
    detectInterval: null,
    lastDetectedCircles: [],

    getImgCoords(offsetX, offsetY) {
        const rect = this.canvasEl.getBoundingClientRect();
        const canvasRatio = this.canvasEl.width / this.canvasEl.height;
        const rectRatio = rect.width / rect.height;
        let renderedWidth, renderedHeight, renderX, renderY;
        if (canvasRatio > rectRatio) {
            renderedWidth = rect.width;
            renderedHeight = rect.width / canvasRatio;
            renderX = 0;
            renderY = (rect.height - renderedHeight) / 2;
        } else {
            renderedHeight = rect.height;
            renderedWidth = rect.height * canvasRatio;
            renderX = (rect.width - renderedWidth) / 2;
            renderY = 0;
        }
        const scale = this.canvasEl.width / renderedWidth;
        return { x: (offsetX - renderX) * scale, y: (offsetY - renderY) * scale };
    },

    init(videoElementId, canvasElementId) {
        this.videoEl = document.getElementById(videoElementId);
        this.canvasEl = document.getElementById(canvasElementId);
        this.ctx = this.canvasEl.getContext('2d', { willReadFrequently: true });
        this.bindEvents();
    },

    bindEvents() {
        this.canvasEl.addEventListener('mousedown', this.onPointerDown.bind(this));
        this.canvasEl.addEventListener('mousemove', this.onPointerMove.bind(this));
        this.canvasEl.addEventListener('mouseup', this.onPointerUp.bind(this));
        const getTouchOffset = (touch) => {
            const rect = this.canvasEl.getBoundingClientRect();
            return { offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top };
        };
        this.canvasEl.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onPointerDown(getTouchOffset(e.touches[0]));
        }, { passive: false });
        this.canvasEl.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.onPointerMove(getTouchOffset(e.touches[0]));
        }, { passive: false });
        this.canvasEl.addEventListener('touchend', (e) => {
             e.preventDefault();
             this.onPointerUp(e);
        });

        document.getElementById('toggleAutoBtn').addEventListener('click', (e) => {
            this.isAutoDetecting = !this.isAutoDetecting;
            e.currentTarget.classList.toggle('bg-amber-600', this.isAutoDetecting);
            e.currentTarget.classList.toggle('glass-dark', !this.isAutoDetecting);
        });
    },

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            });
            this.videoEl.srcObject = this.stream;
            this.videoEl.onloadedmetadata = () => {
                this.canvasEl.width = this.videoEl.videoWidth;
                this.canvasEl.height = this.videoEl.videoHeight;
                this.videoEl.play();
            };
            this.videoEl.style.display = 'block';
            this.canvasEl.style.display = 'block';
            this.currentImage = null;
            this.boxes = [];
            document.getElementById('detectionStatus').textContent = "Center item in frame";
            document.getElementById('processItemsBtn').style.opacity = "0.3";
            document.getElementById('processItemsBtn').style.pointerEvents = "none";
        } catch (err) {
            console.error("Camera error:", err);
        }
    },

    stopCamera() {
        if (this.stream) { this.stream.getTracks().forEach(track => track.stop()); this.stream = null; }
        this.videoEl.style.display = 'none';
    },

    loadUploadedImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.stopCamera();
                this.canvasEl.width = img.width;
                this.canvasEl.height = img.height;
                this.currentImage = img;
                this.boxes = [];
                this.detectCircles();
                document.getElementById('detectionStatus').textContent = "Select detected items";
                this.redraw();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    async detectCircles() {
        const source = this.currentImage || this.videoEl;
        const srcW = source.width || source.videoWidth;
        const srcH = source.height || source.videoHeight;
        if (!srcW || typeof cv === 'undefined') return;

        // Fetch custom settings
        const { DB } = await import('./db.js');
        const mode = await DB.getSetting('cvScanMode') || 'coin';
        
        if (mode === 'note') {
            return this.detectNotes(source, srcW, srcH);
        }

        const p1 = parseInt(await DB.getSetting('cvParam1')) || 100;
        const p2 = parseInt(await DB.getSetting('cvParam2')) || 30;
        const claheLimit = parseFloat(await DB.getSetting('cvClahe')) || 2.0;
        const bilateral = parseInt(await DB.getSetting('cvBilateral')) || 75;
        const blurSize = parseInt(await DB.getSetting('cvBlur')) || 9;
        const minR = parseInt(await DB.getSetting('cvMinRadius')) || 20;

        const width = 800;
        const height = Math.round(width * (srcH / srcW));
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(source, 0, 0, width, height);
        
        const src = cv.imread(tempCanvas);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        // 1. CLAHE Contrast
        const clahe = new cv.CLAHE(claheLimit, new cv.Size(8, 8));
        clahe.apply(gray, gray);
        clahe.delete();

        // 2. Bilateral Smoothing
        const blurred = new cv.Mat();
        cv.bilateralFilter(gray, blurred, 9, bilateral, bilateral, cv.BORDER_DEFAULT);
        
        // 3. Additional Blur
        if (blurSize > 1) {
            cv.GaussianBlur(blurred, blurred, new cv.Size(blurSize, blurSize), 2);
        }
        
        // Use HoughCircles with dynamic parameters
        const circles = new cv.Mat();
        cv.HoughCircles(blurred, circles, cv.HOUGH_GRADIENT, 1, 50, p1, p2, minR, 200);

        const found = [];
        const scale = srcW / width;

        for (let i = 0; i < circles.cols; ++i) {
            const x = circles.data32F[i * 3] * scale;
            const y = circles.data32F[i * 3 + 1] * scale;
            const r = circles.data32F[i * 3 + 2] * scale;
            found.push({ x: x - r, y: y - r, w: r * 2, h: r * 2, isCircle: true });
        }

        this.lastDetectedCircles = found;
        if (this.currentImage) this.boxes = [...found];
        
        src.delete(); gray.delete(); blurred.delete(); circles.delete();
        this.redraw();
        
        const btn = document.getElementById('processItemsBtn');
        if (btn) {
            btn.style.opacity = this.boxes.length > 0 ? "1" : "0.3";
            btn.style.pointerEvents = this.boxes.length > 0 ? "auto" : "none";
        }
    },

    async detectNotes(source, srcW, srcH) {
        // Fetch custom settings
        const { DB } = await import('./db.js');
        const claheLimit = parseFloat(await DB.getSetting('cvClahe')) || 2.0;
        const bilateral = parseInt(await DB.getSetting('cvBilateral')) || 75;
        const morphSize = 5; // Fixed for notes to keep it simple

        const width = 800;
        const height = Math.round(width * (srcH / srcW));
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(source, 0, 0, width, height);
        
        const src = cv.imread(tempCanvas);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        // 1. Contrast Normalization
        const clahe = new cv.CLAHE(claheLimit, new cv.Size(8, 8));
        clahe.apply(gray, gray);
        clahe.delete();

        // 2. Surface Smoothing
        const blurred = new cv.Mat();
        cv.bilateralFilter(gray, blurred, 9, bilateral, bilateral, cv.BORDER_DEFAULT);
        
        // 3. Edge Detection
        const thresh = new cv.Mat();
        cv.Canny(blurred, thresh, 50, 150, 3, false);
        
        // 4. Morphological Closing (Connects broken edges of the note)
        const M = cv.Mat.ones(morphSize, morphSize, cv.CV_8U);
        cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, M);
        M.delete();
        
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        const found = [];
        const scale = srcW / width;

        for (let i = 0; i < contours.size(); ++i) {
            const cnt = contours.get(i);
            const area = cv.contourArea(cnt);
            const peri = cv.arcLength(cnt, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

            if (approx.rows === 4 && area > (width * height * 0.05)) {
                const rect = cv.boundingRect(approx);
                found.push({
                    x: rect.x * scale, y: rect.y * scale, w: rect.width * scale, h: rect.height * scale,
                    isCircle: false
                });
            }
            approx.delete(); cnt.delete();
        }

        this.lastDetectedCircles = found;
        if (this.currentImage) this.boxes = [...found];
        
        src.delete(); gray.delete(); blurred.delete(); thresh.delete(); contours.delete(); hierarchy.delete();
        this.redraw();
        
        const btn = document.getElementById('processItemsBtn');
        if (btn) {
            btn.style.opacity = this.boxes.length > 0 ? "1" : "0.3";
            btn.style.pointerEvents = this.boxes.length > 0 ? "auto" : "none";
        }
    },

    takePhoto() {
        if (!this.videoEl.videoWidth) return;
        this.ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
        this.currentImage = new Image();
        this.currentImage.src = this.canvasEl.toDataURL('image/jpeg');
        this.videoEl.style.display = 'none';
        this.detectCircles();
        document.getElementById('detectionStatus').textContent = "Analysis Complete";
    },

    onPointerDown(e) {
        if (!this.currentImage) return;
        this.isDrawing = true;
        this.moved = false;
        const coords = this.getImgCoords(e.offsetX, e.offsetY);
        this.startX = coords.x;
        this.startY = coords.y;
    },

    onPointerMove(e) {
        if (!this.isDrawing) return;
        const coords = this.getImgCoords(e.offsetX, e.offsetY);
        if (Math.abs(coords.x - this.startX) > 10) this.moved = true;
        if (this.moved) {
            this.redraw();
            this.ctx.strokeStyle = '#f59e0b';
            this.ctx.lineWidth = 4;
            this.ctx.setLineDash([10, 5]);
            const dx = coords.x - this.startX;
            const dy = coords.y - this.startY;
            const radius = Math.sqrt(dx*dx + dy*dy);
            this.ctx.beginPath();
            this.ctx.arc(this.startX, this.startY, radius, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    },

    onPointerUp(e) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        const coords = this.getImgCoords(e.offsetX, e.offsetY);
        if (!this.moved) {
            const tappedIdx = this.lastDetectedCircles.findIndex(c => {
                if (c.isCircle) {
                    const r = c.w / 2;
                    const dist = Math.sqrt(Math.pow(this.startX - (c.x + r), 2) + Math.pow(this.startY - (c.y + r), 2));
                    return dist <= r;
                } else {
                    return this.startX >= c.x && this.startX <= c.x + c.w && this.startY >= c.y && this.startY <= c.y + c.h;
                }
            });
            if (tappedIdx !== -1) {
                const item = this.lastDetectedCircles[tappedIdx];
                const existingIdx = this.boxes.findIndex(b => Math.abs(b.x - item.x) < 5);
                if (existingIdx !== -1) this.boxes.splice(existingIdx, 1);
                else this.boxes.push(item);
            }
        } else {
            const dx = coords.x - this.startX;
            const dy = coords.y - this.startY;
            const absW = Math.abs(dx);
            const absH = Math.abs(dy);
            
            import('./db.js').then(async module => {
                const mode = await module.DB.getSetting('cvScanMode') || 'coin';
                if (mode === 'coin') {
                    const radius = Math.sqrt(dx*dx + dy*dy);
                    if (radius > 30) {
                        this.boxes.push({ x: this.startX - radius, y: this.startY - radius, w: radius * 2, h: radius * 2, isCircle: true });
                    }
                } else {
                    if (absW > 40 && absH > 40) {
                        this.boxes.push({ x: Math.min(this.startX, coords.x), y: Math.min(this.startY, coords.y), w: absW, h: absH, isCircle: false });
                    }
                }
                this.redraw();
            });
        }
        this.redraw();
        const btn = document.getElementById('processItemsBtn');
        if (btn) {
            btn.style.opacity = this.boxes.length > 0 ? "1" : "0.3";
            btn.style.pointerEvents = this.boxes.length > 0 ? "auto" : "none";
        }
    },

    redraw() {
        this.ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
        if (this.currentImage) this.ctx.drawImage(this.currentImage, 0, 0);
        this.boxes.forEach(box => {
            this.ctx.strokeStyle = '#f59e0b';
            this.ctx.lineWidth = 10;
            this.ctx.setLineDash([]);
            if (box.isCircle) {
                const r = box.w / 2;
                const cx = box.x + r;
                const cy = box.y + r;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
                this.ctx.fill();
            } else {
                this.ctx.strokeRect(box.x, box.y, box.w, box.h);
                this.ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
                this.ctx.fillRect(box.x, box.y, box.w, box.h);
            }
        });
    },

    clearBoxes() { this.boxes = []; this.redraw(); },

    extractCrops() {
        const crops = [];
        if (!this.currentImage || typeof cv === 'undefined') return crops;
        const src = cv.imread(this.canvasEl);
        this.boxes.forEach(box => {
            const rect = new cv.Rect(
                Math.max(0, Math.round(box.x)), Math.max(0, Math.round(box.y)),
                Math.min(src.cols - box.x, Math.round(box.w)), Math.min(src.rows - box.y, Math.round(box.h))
            );
            const dst = src.roi(rect);
            const tempCanvas = document.createElement('canvas');
            cv.imshow(tempCanvas, dst);
            crops.push(tempCanvas.toDataURL('image/jpeg', 0.9));
            dst.delete();
        });
        src.delete();
        return crops;
    }
};
