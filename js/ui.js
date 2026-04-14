/* global Chart */
export const UI = {
    app: null,
    currentView: 'dashboardView',
    chartInstance: null,
    allItems: [],

    init(appInstance) {
        this.app = appInstance;
        this.bindNavigation();
        this.bindCaptureActions();
        this.bindSettings();
        this.bindCollectionControls();
        this.bindDataManagement();
        this.bindBottomSheet();
        
        // Initial setup for models and CV settings
        import('./db.js').then(module => {
            module.DB.getSetting('geminiApiKey').then(key => {
                if (key) {
                    document.getElementById('apiKeyInput').value = key;
                    this.refreshModelList();
                }
            });
            module.DB.getSetting('geminiModel').then(model => {
                if (model) document.getElementById('modelSelect').value = model;
            });

            // Load Scan Mode
            module.DB.getSetting('cvScanMode').then(mode => {
                this.updateModeUI(mode || 'coin');
            });

            // Load CV Settings
            const cvSettings = ['cvParam1', 'cvParam2', 'cvClahe', 'cvBilateral', 'cvBlur', 'cvMinRadius'];
            cvSettings.forEach(s => {
                module.DB.getSetting(s).then(val => {
                    if (val) {
                        const el = document.getElementById(s);
                        if (el) el.value = val;
                        
                        // Sync the "Tune" sliders in capture view
                        const tuneId = s.replace('cv', 'tune');
                        const tuneEl = document.getElementById(tuneId);
                        if (tuneEl) {
                            tuneEl.value = val;
                            const valDisplay = document.getElementById(tuneId.replace('tune', 'val'));
                            if (valDisplay) valDisplay.textContent = val;
                        }
                    }
                });
            });
        });
        
        this.bindCvTuning();
    },

    bindCvTuning() {
        const sheet = document.getElementById('cvSettingsSheet');
        const openBtn = document.getElementById('openCvTuneBtn');
        const closeBtn = document.getElementById('closeCvTuneBtn');

        if (openBtn) {
            openBtn.addEventListener('click', () => {
                sheet.classList.remove('hidden', 'lg:hidden');
                setTimeout(() => sheet.classList.remove('translate-y-full'), 10);
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                sheet.classList.add('translate-y-full');
                setTimeout(() => sheet.classList.add('hidden', 'lg:hidden'), 400);
            });
        }

        // Live syncing of sliders
        ['Param1', 'Param2', 'Clahe', 'Bilateral', 'Blur', 'MinRadius'].forEach(s => {
            const tuneEl = document.getElementById('tune' + s);
            const valDisplay = document.getElementById('val' + s);
            const mainEl = document.getElementById('cv' + s);

            if (tuneEl) {
                tuneEl.addEventListener('input', async (e) => {
                    const val = e.target.value;
                    if (valDisplay) valDisplay.textContent = val;
                    if (mainEl) mainEl.value = val;

                    // Save instantly
                    const { DB } = await import('./db.js');
                    await DB.saveSetting('cv' + s, val);

                    // Trigger re-detect if an image is active
                    const { Capture } = await import('./capture.js');
                    if (Capture.currentImage) {
                        Capture.detectCircles();
                    }
                });
            }
        });
    },

    bindNavigation() {
        document.querySelectorAll('[data-nav]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-nav');
                this.switchView(target);
                if (navigator.vibrate) navigator.vibrate(5);
            });
        });
    },

    bindCaptureActions() {
        const Capture = import('./capture.js').then(m => m.Capture);
        
        document.getElementById('uploadPhotoInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                (await Capture).loadUploadedImage(file);
                document.getElementById('retakePhotoBtn').classList.remove('hidden');
                document.getElementById('processItemsBtn').classList.remove('hidden');
                document.getElementById('takePhotoBtn').classList.add('hidden');
                e.target.value = ''; // Reset
            }
        });

        document.getElementById('takePhotoBtn').addEventListener('click', async () => {
            (await Capture).takePhoto();
            document.getElementById('retakePhotoBtn').classList.remove('hidden');
            document.getElementById('processItemsBtn').classList.remove('hidden');
            document.getElementById('takePhotoBtn').classList.add('hidden');
        });

        document.getElementById('retakePhotoBtn').addEventListener('click', async () => {
            (await Capture).startCamera();
            document.getElementById('retakePhotoBtn').classList.add('hidden');
            document.getElementById('processItemsBtn').classList.add('hidden');
            document.getElementById('takePhotoBtn').classList.remove('hidden');
        });

        document.getElementById('processItemsBtn').addEventListener('click', () => {
            this.app.processCapturedItems();
        });
    },

    updateModeUI(mode) {
        const coinBtn = document.getElementById('modeCoinBtn');
        const noteBtn = document.getElementById('modeNoteBtn');
        const isCoin = mode === 'coin';
        
        coinBtn.classList.toggle('bg-white', isCoin);
        coinBtn.classList.toggle('shadow-sm', isCoin);
        coinBtn.classList.toggle('text-amber-700', isCoin);
        coinBtn.classList.toggle('text-stone-400', !isCoin);

        noteBtn.classList.toggle('bg-white', !isCoin);
        noteBtn.classList.toggle('shadow-sm', !isCoin);
        noteBtn.classList.toggle('text-amber-700', !isCoin);
        noteBtn.classList.toggle('text-stone-400', isCoin);
        
        // Update guide UI
        const guide = document.getElementById('captureGuide')?.firstElementChild;
        if (guide) {
            guide.classList.toggle('rounded-full', isCoin);
            guide.classList.toggle('rounded-[2.5rem]', !isCoin);
            guide.classList.toggle('aspect-square', isCoin);
            guide.style.width = isCoin ? '16rem' : '100%';
            guide.style.aspectRatio = isCoin ? '1/1' : '3/2';
        }
    },

    bindSettings() {
        document.getElementById('modeCoinBtn').addEventListener('click', async () => {
            const module = await import('./db.js');
            await module.DB.saveSetting('cvScanMode', 'coin');
            this.updateModeUI('coin');
        });

        document.getElementById('modeNoteBtn').addEventListener('click', async () => {
            const module = await import('./db.js');
            await module.DB.saveSetting('cvScanMode', 'note');
            this.updateModeUI('note');
        });

        document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
            const key = document.getElementById('apiKeyInput').value;
            const model = document.getElementById('modelSelect').value;
            await this.app.saveSettings(key, model);

            // Save CV Settings
            const module = await import('./db.js');
            const cvSettings = ['cvParam1', 'cvParam2', 'cvBlur', 'cvMinRadius'];
            for (const s of cvSettings) {
                await module.DB.saveSetting(s, document.getElementById(s).value);
            }

            this.refreshModelList();
        });
    },

    switchView(viewId) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        this.currentView = viewId;

        // Header/Nav visibility
        const isCapture = viewId === 'captureView';
        document.getElementById('mainHeader').classList.toggle('hidden', isCapture);
        document.getElementById('bottomNav').classList.toggle('hidden', isCapture);

        // Sidebar/BottomNav active states
        document.querySelectorAll('[data-nav]').forEach(btn => {
            const isTarget = btn.getAttribute('data-nav') === viewId;
            const isSidebar = btn.closest('#sidebar');
            
            if (isSidebar) {
                btn.classList.toggle('text-amber-700', isTarget);
                btn.classList.toggle('bg-amber-50', isTarget);
                btn.classList.toggle('text-stone-400', !isTarget);
                btn.classList.toggle('bg-transparent', !isTarget);
            } else {
                btn.classList.toggle('text-amber-700', isTarget);
                btn.classList.toggle('text-stone-400', !isTarget);
            }
        });

        if (viewId === 'captureView') {
            import('./capture.js').then(m => {
                if (m.Capture.currentImage) {
                    m.Capture.videoEl.style.display = 'none';
                    m.Capture.canvasEl.style.display = 'block';
                    m.Capture.detectCircles(); // Re-detect with potentially new settings
                    
                    document.getElementById('takePhotoBtn').classList.add('hidden');
                    document.getElementById('retakePhotoBtn').classList.remove('hidden');
                } else {
                    m.Capture.startCamera();
                    document.getElementById('takePhotoBtn').classList.remove('hidden');
                    document.getElementById('retakePhotoBtn').classList.add('hidden');
                }
            });
        } else {
            import('./capture.js').then(m => m.Capture.stopCamera());
        }
    },

    renderCollection(items) {
        this.allItems = items;
        this.updateCountryFilter(items);
        this.renderGrid(items);
    },

    updateCountryFilter(items) {
        const filter = document.getElementById('countryFilter');
        const countries = [...new Set(items.map(i => i.country))].sort();
        filter.innerHTML = '<option value="All">All Countries</option>' + countries.map(c => `<option value="${c}">${c}</option>`).join('');
    },

    renderGrid(items) {
        const grid = document.getElementById('collectionGrid');
        grid.innerHTML = items.length === 0 ? '<div class="col-span-full text-center text-stone-400 py-20 font-bold uppercase tracking-widest">Vault Empty</div>' : '';
        
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'bg-white rounded-2xl shadow-sm overflow-hidden active:scale-95 transition-transform relative border border-stone-100';
            el.innerHTML = `
                <img src="${item.imageBlob}" class="w-full h-40 object-cover bg-stone-50">
                <div class="p-3">
                    <h3 class="font-bold text-sm truncate">${item.denomination}</h3>
                    <p class="text-[10px] text-stone-400 font-bold uppercase tracking-tight">${item.year} • ${item.country}</p>
                    <div class="mt-2 flex justify-between items-center">
                        <span class="text-sm font-black text-green-600">$${item.estimatedValue}</span>
                        <span class="text-[10px] bg-amber-50 px-2 py-0.5 rounded-full font-bold text-amber-700 border border-amber-100">${item.grade}</span>
                    </div>
                </div>
                <button class="absolute top-2 right-2 bg-white/80 backdrop-blur-md text-red-500 rounded-full w-7 h-7 flex items-center justify-center shadow-sm delete-btn" data-id="${item.id}">
                    <span class="iconify" data-icon="mdi:trash-can-outline"></span>
                </button>
            `;

            el.addEventListener('click', (e) => { if(!e.target.closest('.delete-btn')) this.showItemDetail(item); });
            el.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.app.deleteItem(item.id);
            });
            grid.appendChild(el);
        });
    },

    renderDashboard(items) {
        document.getElementById('totalItemsStat').textContent = items.length;
        document.getElementById('totalValueStat').textContent = '$' + items.reduce((sum, i) => sum + (Number(i.estimatedValue) || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2});
        
        // Render Recent Grid
        const recent = [...items].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded)).slice(0, 5);
        const grid = document.getElementById('recentGrid');
        if (grid) {
            grid.innerHTML = '';
            recent.forEach(item => {
                const el = document.createElement('div');
                el.className = 'bg-stone-50 rounded-2xl overflow-hidden aspect-square border border-stone-100 cursor-pointer hover:scale-105 transition-transform';
                el.innerHTML = `<img src="${item.imageBlob}" class="w-full h-full object-cover">`;
                el.onclick = () => this.showItemDetail(item);
                grid.appendChild(el);
            });
        }

        this.renderChart(items);
    },

    renderChart(items) {
        const ctx = document.getElementById('valueChart').getContext('2d');
        if (this.chartInstance) this.chartInstance.destroy();
        const countryData = {};
        items.forEach(i => { countryData[i.country] = (countryData[i.country] || 0) + (Number(i.estimatedValue) || 0); });
        const labels = Object.keys(countryData);
        this.chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: labels.map(l => countryData[l]),
                    backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#6b7280'],
                    borderWidth: 0,
                    hoverOffset: 20
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '70%',
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { weight: 'bold', size: 10 } } } }
            }
        });
    },

    showItemDetail(item) {
        document.getElementById('detailImage').src = item.imageBlob;
        document.getElementById('editCountry').value = item.country;
        document.getElementById('editDenom').value = item.denomination;
        document.getElementById('editYear').value = item.year;
        document.getElementById('editMint').value = item.mintMark || '';
        document.getElementById('editMetal').value = item.metal;
        document.getElementById('editGrade').value = item.grade;
        document.getElementById('editValue').value = item.estimatedValue;
        document.getElementById('editCitation').value = item.citation || '';
        document.getElementById('editDesc').value = item.description || '';

        const saveBtn = document.getElementById('saveEditBtn');
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

        const deleteBtn = document.getElementById('deleteDetailBtn');
        const newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);

        newSaveBtn.addEventListener('click', () => {
            item.country = document.getElementById('editCountry').value;
            item.denomination = document.getElementById('editDenom').value;
            item.year = document.getElementById('editYear').value;
            item.mintMark = document.getElementById('editMint').value;
            item.metal = document.getElementById('editMetal').value;
            item.grade = document.getElementById('editGrade').value;
            item.estimatedValue = document.getElementById('editValue').value;
            item.citation = document.getElementById('editCitation').value;
            item.description = document.getElementById('editDesc').value;
            this.app.saveItemEdit(item);
            this.closeBottomSheet();
        });

        newDeleteBtn.addEventListener('click', () => {
            this.closeBottomSheet();
            this.app.deleteItem(item.id);
        });

        document.getElementById('cancelEditBtn').onclick = () => this.closeBottomSheet();
        this.openBottomSheet();
    },

    showToast(msg, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = `fixed bottom-24 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl text-white z-[120] font-bold transition-all duration-300 ${type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-amber-700'}`;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    },

    showLoading(msg) {
        document.getElementById('loadingText').textContent = msg;
        document.getElementById('loadingOverlay').classList.remove('hidden');
    },

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
};