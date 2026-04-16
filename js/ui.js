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

    bindCollectionControls() {
        const searchInput = document.getElementById('searchInput');
        const countryFilter = document.getElementById('countryFilter');
        const sortOrder = document.getElementById('sortOrder');

        if (searchInput) {
            searchInput.addEventListener('input', () => this.applyCollectionFilters());
        }
        if (countryFilter) {
            countryFilter.addEventListener('change', () => this.applyCollectionFilters());
        }
        if (sortOrder) {
            sortOrder.addEventListener('change', () => this.applyCollectionFilters());
        }
    },

    applyCollectionFilters() {
        const searchInput = document.getElementById('searchInput');
        const countryFilter = document.getElementById('countryFilter');
        const sortOrder = document.getElementById('sortOrder');

        const searchTerm = (searchInput?.value || '').trim().toLowerCase();
        const selectedCountry = countryFilter?.value || 'All';
        const selectedSort = sortOrder?.value === 'valueHigh' ? 'valueHigh' : 'newest';

        let filtered = [...this.allItems];

        if (searchTerm) {
            filtered = filtered.filter(item => {
                const denom = String(item.denomination || '').toLowerCase();
                const country = String(item.country || '').toLowerCase();
                const year = String(item.year || '').toLowerCase();
                return denom.includes(searchTerm) || country.includes(searchTerm) || year.includes(searchTerm);
            });
        }

        if (selectedCountry !== 'All') {
            filtered = filtered.filter(item => item.country === selectedCountry);
        }

        filtered.sort((a, b) => {
            if (selectedSort === 'valueHigh') {
                return (Number(b.estimatedValue) || 0) - (Number(a.estimatedValue) || 0);
            }
            const bTime = Date.parse(b.dateAdded);
            const aTime = Date.parse(a.dateAdded);
            return (Number.isFinite(bTime) ? bTime : Number.NEGATIVE_INFINITY) - (Number.isFinite(aTime) ? aTime : Number.NEGATIVE_INFINITY);
        });

        this.renderGrid(filtered);
    },

    bindDataManagement() {
        const exportBtn = document.getElementById('exportDataBtn');
        const importInput = document.getElementById('importFileInput');

        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                try {
                    const { DB } = await import('./db.js');
                    const items = await DB.getAllItems();
                    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `coinvault-export-${new Date().toISOString().slice(0, 10)}.json`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    this.showToast('Vault exported.', 'success');
                } catch (error) {
                    console.error('Export failed:', error);
                    this.showToast('Export failed.', 'error');
                }
            });
        }

        if (importInput) {
            importInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const payload = JSON.parse(text);

                    if (!Array.isArray(payload)) {
                        throw new Error('Invalid import format');
                    }

                    const { DB } = await import('./db.js');
                    const existing = await DB.getAllItems();
                    await Promise.all(existing.map(item => DB.deleteItem(item.id)));

                    for (const [index, raw] of payload.entries()) {
                        const item = this.normalizeImportedItem(raw, index);
                        await DB.addItem(item);
                    }

                    await this.app.loadCollection();
                    this.showToast(`Imported ${payload.length} item(s).`, 'success');
                } catch (error) {
                    console.error('Import failed:', error);
                    this.showToast('Import failed. Check file format.', 'error');
                } finally {
                    e.target.value = '';
                }
            });
        }
    },

    normalizeImportedItem(raw, index) {
        const item = (raw && typeof raw === 'object') ? raw : {};
        const generatedId = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `coin_${Date.now()}_${index}_${Math.random().toString(36).slice(2)}`;
        return {
            id: String(item.id || generatedId),
            imageBlob: String(item.imageBlob || ''),
            country: String(item.country || 'Unknown'),
            denomination: String(item.denomination || 'Unknown'),
            year: String(item.year || 'Unknown'),
            mintMark: String(item.mintMark || ''),
            metal: String(item.metal || 'Unknown'),
            grade: String(item.grade || 'Raw'),
            estimatedValue: Number(item.estimatedValue) || 0,
            citation: String(item.citation || ''),
            description: String(item.description || ''),
            dateAdded: item.dateAdded ? String(item.dateAdded) : new Date().toISOString(),
            tags: Array.isArray(item.tags) ? item.tags : []
        };
    },

    bindBottomSheet() {
        const overlay = document.getElementById('sheetOverlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeBottomSheet());
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeBottomSheet();
        });
    },

    openBottomSheet() {
        const overlay = document.getElementById('sheetOverlay');
        const sheet = document.getElementById('itemBottomSheet');
        if (overlay) overlay.classList.add('show');
        if (sheet) sheet.classList.add('open');
        document.body.style.overflow = 'hidden';
    },

    closeBottomSheet() {
        const overlay = document.getElementById('sheetOverlay');
        const sheet = document.getElementById('itemBottomSheet');
        if (overlay) overlay.classList.remove('show');
        if (sheet) sheet.classList.remove('open');
        document.body.style.overflow = '';
    },

    async refreshModelList() {
        const apiKeyInput = document.getElementById('apiKeyInput');
        const modelSelect = document.getElementById('modelSelect');
        if (!apiKeyInput || !modelSelect) return;

        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            modelSelect.innerHTML = '<option value="">Set API key to load models</option>';
            return;
        }

        try {
            const { AI } = await import('./ai.js');
            AI.apiKey = apiKey;
            const models = await AI.fetchAvailableModels();
            const selected = modelSelect.value;

            if (!models.length) {
                modelSelect.innerHTML = '<option value="">No models available</option>';
                return;
            }

            const modelPrefix = 'models/';
            const modelNames = models.map(model => model.name.replaceAll(modelPrefix, ''));
            modelSelect.innerHTML = modelNames.map(name => `<option value="${name}">${name}</option>`).join('');

            const hasSelected = modelNames.includes(selected);
            modelSelect.value = hasSelected ? selected : modelNames[0];
        } catch (error) {
            console.error('Model refresh failed:', error);
            modelSelect.innerHTML = '<option value="">Failed to load models</option>';
        }
    },

    renderCollection(items) {
        this.allItems = items;
        this.updateCountryFilter(items);
        this.applyCollectionFilters();
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
