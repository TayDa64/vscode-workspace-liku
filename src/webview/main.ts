// src/webview/main.ts
interface VsCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(newState: any): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

interface RecommendedExtensionWeb { id: string; name?: string; }
interface KeySettingWeb { key: string; value: any; description?: string; }
interface WorkspaceProfileWeb {
    id: string; name: string; description?: string;
    recommendedExtensions: RecommendedExtensionWeb[];
    keySettingsSnippet: KeySettingWeb[];
    isUserDefined?: boolean;
}

(function () {
    const vscode = acquireVsCodeApi();
    const persistedState = vscode.getState() || { selectedProfileId: null, lastSearchTerm: "" };
    vscode.setState(persistedState); // Initialize or restore state

    // DOM Elements for new Combo Search
    const comboSearchInput = document.getElementById('comboSearchInput') as HTMLInputElement;
    const comboToggleBtn = document.getElementById('comboToggleBtn') as HTMLButtonElement;
    const comboResultsList = document.getElementById('comboResultsList') as HTMLUListElement;

    // Other DOM Elements (Details section, Modal, etc. - largely same as before)
    const createNewProfileBtn = document.getElementById('createNewProfileBtn') as HTMLButtonElement;
    const profileDetailsSection = document.getElementById('profileDetails') as HTMLDivElement;
    const profileNameEl = document.getElementById('profileName') as HTMLHeadingElement;
    const profileDescriptionEl = document.getElementById('profileDescription') as HTMLParagraphElement;
    const recommendedExtensionsListEl = document.getElementById('recommendedExtensionsList') as HTMLUListElement;
    const keySettingsSnippetContentEl = document.getElementById('keySettingsSnippetContent') as HTMLPreElement;
    const applyButton = document.getElementById('applyConfigurationButton') as HTMLButtonElement;
    const cloneCurrentProfileBtn = document.getElementById('cloneCurrentProfileBtn') as HTMLButtonElement;
    const editCurrentProfileBtn = document.getElementById('editCurrentProfileBtn') as HTMLButtonElement;
    const deleteCurrentProfileBtn = document.getElementById('deleteCurrentProfileBtn') as HTMLButtonElement;
    const editProfileModal = document.getElementById('editProfileModal') as HTMLDivElement;
    const modalTitle = document.getElementById('modalTitle') as HTMLHeadingElement;
    const editProfileIdInput = document.getElementById('editProfileId') as HTMLInputElement;
    const editProfileNameInput = document.getElementById('editProfileName') as HTMLInputElement;
    const editProfileDescriptionTextarea = document.getElementById('editProfileDescription') as HTMLTextAreaElement;
    const editRecommendedExtensionsTextarea = document.getElementById('editRecommendedExtensions') as HTMLTextAreaElement;
    const editKeySettingsTextarea = document.getElementById('editKeySettings') as HTMLTextAreaElement;
    const saveProfileButton = document.getElementById('saveProfileButton') as HTMLButtonElement;
    const cancelEditProfileButton = document.getElementById('cancelEditProfileButton') as HTMLButtonElement;

    let allProfilesCache: WorkspaceProfileWeb[] = [];
    let currentEditingProfileOriginalId: string | null = null;
    let isCloneOperationIntent: boolean = false;
    let activeSuggestionIndex = -1; // For keyboard navigation in combo list

    // --- Initialization ---
    console.log("[Liku Webview] Initializing. Requesting profiles.");
    vscode.postMessage({ command: 'getProfiles' });
    comboSearchInput.value = persistedState.lastSearchTerm || "";


    // --- Combo Search/Select Logic ---
    function renderComboResults(searchTerm: string = "") {
        const lowerSearchTerm = searchTerm.toLowerCase();
        const filteredProfiles = allProfilesCache.filter(p =>
            p.name.toLowerCase().includes(lowerSearchTerm) ||
            (p.description && p.description.toLowerCase().includes(lowerSearchTerm))
        );

        comboResultsList.innerHTML = ''; // Clear old results
        activeSuggestionIndex = -1;

        if (filteredProfiles.length === 0) {
            const li = document.createElement('li');
            li.className = 'no-results';
            li.textContent = searchTerm ? "No profiles found." : "No profiles available.";
            comboResultsList.appendChild(li);
            return; // Don't show group labels if no results
        }
        
        const builtIns = filteredProfiles.filter(p => !p.isUserDefined);
        const userDefs = filteredProfiles.filter(p => p.isUserDefined);

        const addProfileOption = (profile: WorkspaceProfileWeb) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'option');
            li.dataset.id = profile.id;
            li.textContent = profile.name;
            if (profile.id === persistedState.selectedProfileId) {
                li.setAttribute('aria-selected', 'true');
                // You might add a class for styling current selection in list if needed
            }
            li.addEventListener('mousedown', (e) => { // Mousedown preferred over click for lists that hide on blur
                e.preventDefault();
                selectProfile(profile.id, profile.name);
            });
            comboResultsList.appendChild(li);
        };
        
        const addGroupLabel = (text: string) => {
            const li = document.createElement('li');
            li.className = 'group-label';
            li.textContent = text;
            li.setAttribute('role', 'separator');
            comboResultsList.appendChild(li);
        };

        if (builtIns.length > 0) {
            if (searchTerm === "" || filteredProfiles.length === allProfilesCache.length) {
                addGroupLabel('Built-in Profiles');
            }
            builtIns.forEach(addProfileOption);
        }
        if (userDefs.length > 0) {
            if (searchTerm === "" || filteredProfiles.length === allProfilesCache.length) {
                 if (builtIns.length > 0 && (searchTerm === "" || filteredProfiles.length === allProfilesCache.length)) { /* only add if builtins also shown as group */ }
                 addGroupLabel('User Profiles');
            }
            userDefs.forEach(addProfileOption);
        }
    }

    function selectProfile(profileId: string, profileName: string) {
        console.log("[Liku Webview] Profile selected via combo:", profileId);
        persistedState.selectedProfileId = profileId;
        persistedState.lastSearchTerm = profileName; // Store selected name as last search term
        vscode.setState(persistedState);

        comboSearchInput.value = profileName; // Update input field
        comboResultsList.classList.add('hidden'); // Hide the list

        const selectedProfile = allProfilesCache.find(p => p.id === profileId);
        updateProfileDetailsUI(selectedProfile);
    }

    function updateProfileDetailsUI(profile: WorkspaceProfileWeb | undefined | null) {
        profileDetailsSection.classList.toggle('hidden', !profile);
        applyButton.disabled = !profile;
        cloneCurrentProfileBtn.classList.toggle('hidden', !profile);
        cloneCurrentProfileBtn.disabled = !profile;

        if (profile) {
            profileNameEl.textContent = `${profile.name} ${profile.isUserDefined ? '(User)' : '(Built-in)'}`;
            profileDescriptionEl.textContent = profile.description || '';
            recommendedExtensionsListEl.innerHTML = '';
            (profile.recommendedExtensions || []).forEach(ext => {
                const li = document.createElement('li'); const link = document.createElement('a');
                link.textContent = ext.name ? `${ext.name} (${ext.id})` : ext.id;
                link.title = `View ${ext.id} on Marketplace`; link.href = "#";
                link.addEventListener('click', (e) => { e.preventDefault(); vscode.postMessage({ command: 'openMarketplacePage', extensionId: ext.id }); });
                li.appendChild(link); recommendedExtensionsListEl.appendChild(li);
            });
            const settingsObj: any = {};
            (profile.keySettingsSnippet || []).forEach(s => { settingsObj[s.key] = s.value; });
            keySettingsSnippetContentEl.textContent = JSON.stringify(settingsObj, null, 2);

            editCurrentProfileBtn.classList.toggle('hidden', !profile.isUserDefined);
            editCurrentProfileBtn.disabled = !profile.isUserDefined;
            deleteCurrentProfileBtn.classList.toggle('hidden', !profile.isUserDefined);
            deleteCurrentProfileBtn.disabled = !profile.isUserDefined;
        } else {
            // Clear details and hide/disable action buttons
            profileNameEl.textContent = ''; profileDescriptionEl.textContent = '';
            recommendedExtensionsListEl.innerHTML = ''; keySettingsSnippetContentEl.textContent = '';
            editCurrentProfileBtn.classList.add('hidden'); deleteCurrentProfileBtn.classList.add('hidden');
        }
    }
    
    comboSearchInput.addEventListener('input', () => {
        persistedState.lastSearchTerm = comboSearchInput.value; // Persist search term as user types
        vscode.setState(persistedState);
        renderComboResults(comboSearchInput.value);
        if (!comboResultsList.classList.contains('hidden') && comboResultsList.children.length > 0) {
            // If list is visible and has items, don't hide it on input
        } else if (comboResultsList.children.length > 0) {
             comboResultsList.classList.remove('hidden'); // Show if there are results
        }
    });
    comboSearchInput.addEventListener('focus', () => {
        renderComboResults(comboSearchInput.value); // Show (potentially filtered) list on focus
        comboResultsList.classList.remove('hidden');
    });
    comboSearchInput.addEventListener('blur', () => {
        setTimeout(() => { // Delay to allow click on list items
            if (!comboResultsList.matches(':hover') && !saveProfileButton.matches(':focus')) { // Don't hide if mouse is over list or save button has focus (modal context)
                comboResultsList.classList.add('hidden');
            }
        }, 150);
    });
    comboToggleBtn.addEventListener('click', () => {
        if (comboResultsList.classList.contains('hidden')) {
            renderComboResults(""); // Show all profiles
            comboResultsList.classList.remove('hidden');
            comboSearchInput.focus();
        } else {
            comboResultsList.classList.add('hidden');
        }
    });
    comboSearchInput.addEventListener('keydown', (e) => {
        const items = Array.from(comboResultsList.querySelectorAll('li[role="option"]')) as HTMLLIElement[];
        if (items.length === 0 || comboResultsList.classList.contains('hidden')) {
            return;
        }

        let handled = false;
        if (e.key === 'ArrowDown') {
            activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
            handled = true;
        } else if (e.key === 'ArrowUp') {
            activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
            handled = true;
        } else if (e.key === 'Enter') {
            if (activeSuggestionIndex >= 0 && activeSuggestionIndex < items.length) {
                items[activeSuggestionIndex].dispatchEvent(new MouseEvent('mousedown', {bubbles: true})); // Simulate click
            }
            handled = true;
        } else if (e.key === 'Escape') {
            comboResultsList.classList.add('hidden');
            handled = true;
        }
        if (handled) {
            e.preventDefault();
            items.forEach((item, index) => item.classList.toggle('active-suggestion', index === activeSuggestionIndex));
            if (activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
                items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
            }
        }
    });


    // --- Other Event Listeners & Modal Logic (largely same as your stable version) ---
    applyButton.addEventListener('click', () => {
        if (persistedState.selectedProfileId) {
            vscode.postMessage({ command: 'applyConfiguration', profileId: persistedState.selectedProfileId });
        }
    });
    createNewProfileBtn.addEventListener('click', () => openEditModal(null, false));
    cloneCurrentProfileBtn.addEventListener('click', () => {
        const profile = allProfilesCache.find(p => p.id === persistedState.selectedProfileId);
        if (profile) { openEditModal(profile, true); }
    });
    editCurrentProfileBtn.addEventListener('click', () => {
        const profile = allProfilesCache.find(p => p.id === persistedState.selectedProfileId && p.isUserDefined);
        if (profile) { openEditModal(profile, false); }
    });
    deleteCurrentProfileBtn.addEventListener('click', handleDeleteProfile); // Ensure this is correct
    saveProfileButton.addEventListener('click', handleSaveProfile);
    cancelEditProfileButton.addEventListener('click', closeEditModal);

    // openEditModal, closeEditModal, handleSaveProfile - use the robust versions from previous attempts
    // Ensure handleSaveProfile's ID generation and 'isEditingExisting' logic is sound.
    // The versions from the "Complete Code for src/webview/main.ts" (your request before this one)
    // for these modal functions were quite refined. Let's assume they are mostly correct here.
    // Key function: openEditModal
    function openEditModal(profile: WorkspaceProfileWeb | null, isCloneIntentReceived: boolean) {
        isCloneOperationIntent = isCloneIntentReceived;
        currentEditingProfileOriginalId = (profile && profile.isUserDefined && !isCloneOperationIntent) ? profile.id : null;

        if (profile) {
            modalTitle.textContent = isCloneOperationIntent ? `Clone Profile: ${profile.name}` : `Edit Profile: ${profile.name}`;
            editProfileNameInput.value = isCloneOperationIntent ? `${profile.name} (Copy)` : profile.name;
            if (isCloneOperationIntent || !profile.isUserDefined) { // Cloning or "viewing" built-in
                editProfileIdInput.value = ""; 
                editProfileIdInput.readOnly = false;
            } else { // Direct edit of a user profile
                editProfileIdInput.value = profile.id; 
                editProfileIdInput.readOnly = true; 
            }
            editProfileDescriptionTextarea.value = profile.description || "";
            editRecommendedExtensionsTextarea.value = (profile.recommendedExtensions || [])
                .map(ext => ext.name ? `${ext.id},${ext.name}` : ext.id).join('\n');
            const settingsObj: any = {};
            (profile.keySettingsSnippet || []).forEach(s => settingsObj[s.key] = s.value);
            editKeySettingsTextarea.value = JSON.stringify(settingsObj, null, 2);
        } else { /* New profile setup (same as before) */ 
            modalTitle.textContent = "Create New Profile";
            currentEditingProfileOriginalId = null; isCloneOperationIntent = false;
            [editProfileNameInput, editProfileIdInput, editProfileDescriptionTextarea, editRecommendedExtensionsTextarea]
                .forEach(el => el.value = "");
            editKeySettingsTextarea.value = "{\n  \n}";
            editProfileIdInput.readOnly = false;
        }
        editProfileModal.classList.remove('hidden');
        editProfileNameInput.focus();
    }

    function closeEditModal() {
        editProfileModal.classList.add('hidden');
        currentEditingProfileOriginalId = null;
        isCloneOperationIntent = false;
    }

    // handleSaveProfile - Critical for correct save/update
    function handleSaveProfile() {
        const name = editProfileNameInput.value.trim();
        let idFromInput = editProfileIdInput.value.trim();
        if (!name) { vscode.postMessage({ command: 'showError', text: "Profile Name is required." }); return; }

        let finalId = idFromInput;
        if (currentEditingProfileOriginalId) { // Editing an existing user profile
             finalId = currentEditingProfileOriginalId; // ID must not change
             if (idFromInput !== currentEditingProfileOriginalId && !editProfileIdInput.readOnly) {
                // This should ideally not happen if readOnly is set correctly
                vscode.postMessage({ command: 'showError', text: "Error: Attempted to change ID of existing profile." }); return;
             }
        } else { // New profile or clone
            if (!idFromInput && name) { // Auto-generate ID if blank for new/clone
                finalId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w.-]/g, '');
                if (!finalId) { vscode.postMessage({ command: 'showError', text: "Could not auto-generate ID. Please provide one."}); return; }
            } else if (!idFromInput) { // ID still blank
                vscode.postMessage({ command: 'showError', text: "Profile ID is required." }); return;
            }
        }
        
        const description = editProfileDescriptionTextarea.value.trim();
        const rawExt = editRecommendedExtensionsTextarea.value.split('\n').map(l => l.trim()).filter(Boolean);
        const recommendedExtensions: RecommendedExtensionWeb[] = rawExt.map(line => {
            const parts = line.split(','); const extId = parts[0].trim();
            if (!extId) { return null; }
            return { id: extId, name: parts.length > 1 ? parts.slice(1).join(',').trim() : undefined };
        }).filter(ext => ext !== null) as RecommendedExtensionWeb[];
        let keySettingsSnippet: KeySettingWeb[];
        try {
            const settingsObj = JSON.parse(editKeySettingsTextarea.value || "{}");
            keySettingsSnippet = Object.entries(settingsObj).map(([k, v]) => ({ key: k, value: v }));
        } catch (e: any) { vscode.postMessage({ command: 'showError', text: `Invalid JSON in Key Settings: ${e.message}` }); return; }

        const profileData: WorkspaceProfileWeb = { id: finalId, name, description, recommendedExtensions, keySettingsSnippet, isUserDefined: true };
        vscode.postMessage({
            command: 'saveUserProfile', profileData,
            isEditingExisting: !!currentEditingProfileOriginalId && !isCloneOperationIntent // True only for direct edit of existing user profile
        });
    }

    // handleDeleteProfile - Ensure it uses the current selection from combo box (persistedState.selectedProfileId)
    function handleDeleteProfile() {
        const profileIdToDelete = persistedState.selectedProfileId;
        if (!profileIdToDelete) {
            vscode.postMessage({ command: 'showInfo', text: "No profile selected to delete." });
            return;
        }
        const profileObject = allProfilesCache.find(p => p.id === profileIdToDelete);
        if (profileObject && profileObject.isUserDefined) {
            if (confirm(`Are you sure you want to delete the user profile "${profileObject.name}"? This cannot be undone.`)) {
                console.log("[Liku Webview] Requesting deletion of user profile:", profileIdToDelete);
                vscode.postMessage({ command: 'deleteUserProfile', profileId: profileIdToDelete });
            }
        } else if (profileObject && !profileObject.isUserDefined) {
            vscode.postMessage({ command: 'showInfo', text: "Built-in profiles cannot be deleted." });
        } else {
            vscode.postMessage({ command: 'showError', text: "Selected profile not found or cannot be deleted."});
        }
    }


    // --- Message Handling ---
    window.addEventListener('message', event => {
        const message = event.data;
        console.log("[Liku Webview] Message received:", message.command, message);
        switch (message.command) {
            case 'profilesLoaded':
                const builtIns = (message.builtInProfiles || []).map((p: any) => ({...p, isUserDefined: false}));
                const userDefs = (message.userProfiles || []).map((p: any) => ({...p, isUserDefined: true}));
                allProfilesCache = [...builtIns, ...userDefs].sort((a,b) => a.name.localeCompare(b.name));
                console.log("[Liku Webview] Profiles loaded into cache. Total:", allProfilesCache.length);
                
                // Restore last search or show all, then update details for current selection
                renderComboResults(persistedState.lastSearchTerm || "");
                const currentlySelected = allProfilesCache.find(p => p.id === persistedState.selectedProfileId);
                if (currentlySelected) {
                     comboSearchInput.value = persistedState.lastSearchTerm === "" ? currentlySelected.name : persistedState.lastSearchTerm; // if search was empty, show selected name
                } else if (persistedState.selectedProfileId){ // selection was lost
                    persistedState.selectedProfileId = null;
                    persistedState.lastSearchTerm = "";
                    vscode.setState(persistedState);
                    comboSearchInput.value = "";
                }
                updateProfileDetailsUI(currentlySelected);
                break;
            case 'profileActionCompleted': // Generic message from controller after save/delete
                console.log("[Liku Webview] Profile action completed:", message.action, "ID:", message.id);
                if (message.action === 'delete' && persistedState.selectedProfileId === message.id) {
                    // If the deleted profile was the selected one, clear selection
                    persistedState.selectedProfileId = null;
                    persistedState.lastSearchTerm = ""; // Clear search as well
                    vscode.setState(persistedState);
                    comboSearchInput.value = ""; // Clear input field
                    updateProfileDetailsUI(null); // Clear details view
                }
                closeEditModal(); // Close modal if it was open
                // The controller MUST have already sent 'profilesLoaded' before this for the list to be up-to-date
                break;
            case 'profileSaveFailed':
                console.warn("[Liku Webview] Profile save failed message received.");
                break;
        }
    });

})();