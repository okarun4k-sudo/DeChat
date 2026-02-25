import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, onSnapshot, addDoc, updateDoc, arrayUnion, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// SUBSTITUA PELOS SEUS DADOS
const firebaseConfig = {
    apiKey: "AIzaSyD9LDSyd2x2n4Dt6PIQJjLrAltDBWgT2Do",
    authDomain: "mensagem-2f134.firebaseapp.com",
    projectId: "mensagem-2f134",
    storageBucket: "mensagem-2f134.firebasestorage.app",
    messagingSenderId: "1001126917394",
    appId: "1:1001126917394:web:7069c87f494af89cf66fcb"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let userLogged = null;
let currentGroupId = null;
let unsubMessages = null;
let unsubTyping = null;
let typingTimeout = null;

// --- LOGIN & AUTH ---
document.getElementById('btn-auth').onclick = async () => {
    const email = document.getElementById('email-input').value;
    const pass = document.getElementById('password-input').value;
    if(!email || !pass) return alert("Preencha todos os campos!");
    
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        if(e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
            try { await createUserWithEmailAndPassword(auth, email, pass); }
            catch (err) { alert("Erro: " + err.message); }
        } else { alert("Erro: " + e.message); }
    }
};

// Recuperação de Senha
document.getElementById('btn-forgot-pass').onclick = async () => {
    const email = document.getElementById('email-input').value;
    if(!email) return alert("Digite seu e-mail primeiro para recuperar a senha.");
    
    try {
        await sendPasswordResetEmail(auth, email);
        alert("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    } catch (e) { alert("Erro ao enviar e-mail: " + e.message); }
};

// Recarregar Página
const reloadAction = () => window.location.href = window.location.href.split('#')[0];
document.getElementById('btn-reload-login').onclick = reloadAction;
document.getElementById('btn-refresh-app').onclick = reloadAction;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const uSnap = await getDoc(doc(db, "users", user.uid));
        if (!uSnap.exists()) {
            openModal('modal-profile');
            document.getElementById('profile-view-mode').classList.add('hidden');
            document.getElementById('profile-edit-mode').classList.remove('hidden');
        } else {
            userLogged = uSnap.data();
            updateProfileUI();
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');
            loadGroups();
        }
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }
});

// --- PERFIL ---
function updateProfileUI() {
    document.getElementById('view-p-name').innerText = userLogged.displayName;
    document.getElementById('view-p-username').innerText = "@" + userLogged.username;
    document.getElementById('view-p-photo').src = userLogged.photo;
    document.getElementById('view-p-bio').innerText = userLogged.bio || "Nenhuma bio definida.";
    
    document.getElementById('p-name').value = userLogged.displayName;
    document.getElementById('p-username').value = userLogged.username;
    document.getElementById('p-photo').value = userLogged.photo;
    document.getElementById('p-bio').value = userLogged.bio;
}

document.getElementById('btn-edit-profile-toggle').onclick = () => {
    document.getElementById('profile-view-mode').classList.toggle('hidden');
    document.getElementById('profile-edit-mode').classList.toggle('hidden');
};

document.getElementById('btn-save-profile').onclick = async () => {
    const username = document.getElementById('p-username').value.trim().toLowerCase();
    const displayName = document.getElementById('p-name').value;
    const photo = document.getElementById('p-photo').value || "https://via.placeholder.com/150";
    const bio = document.getElementById('p-bio').value;

    const data = { uid: auth.currentUser.uid, username, displayName, photo, bio };
    await setDoc(doc(db, "users", auth.currentUser.uid), data);
    await setDoc(doc(db, "usernames", username), { uid: auth.currentUser.uid });
    
    alert("Perfil salvo!");
    location.reload();
};

// --- CHAT ---
function openChat(id, data) {
    currentGroupId = id;
    document.getElementById('chat-title').innerText = "# " + data.name;
    document.getElementById('chat-input-container').classList.remove('hidden');
    
    if (unsubMessages) unsubMessages();
    const q = query(collection(db, "groups", id, "messages"), orderBy("time", "asc"));
    unsubMessages = onSnapshot(q, (snap) => {
        const box = document.getElementById('chat-messages');
        box.innerHTML = "";
        snap.forEach(mDoc => {
            const m = mDoc.data();
            box.innerHTML += `
                <div class="msg-item">
                    <img src="${m.photo}" class="msg-img">
                    <div>
                        <b>${m.name}</b> <small style="color:#555">${m.time?.toDate().toLocaleTimeString() || ''}</small>
                        <p>${m.text}</p>
                    </div>
                </div>`;
        });
        box.scrollTop = box.scrollHeight;
    });
}

document.getElementById('msg-input').onkeypress = async (e) => {
    if (e.key === 'Enter' && e.target.value.trim() !== "") {
        const text = e.target.value;
        e.target.value = "";
        await addDoc(collection(db, "groups", currentGroupId, "messages"), {
            text, name: userLogged.displayName, photo: userLogged.photo, time: new Date()
        });
    }
};

// --- GRUPOS ---
function loadGroups() {
    onSnapshot(query(collection(db, "groups"), where("members", "array-contains", auth.currentUser.uid)), (snap) => {
        const list = document.getElementById('groups-list');
        list.innerHTML = "";
        snap.forEach(gDoc => {
            const g = gDoc.data();
            const el = document.createElement('div');
            el.className = "server-icon";
            el.style.backgroundImage = `url('${g.photo}')`;
            el.onclick = () => openChat(gDoc.id, g);
            list.appendChild(el);
        });
    });
}

document.getElementById('btn-confirm-group').onclick = async () => {
    const name = document.getElementById('g-name').value;
    const photo = document.getElementById('g-photo').value || "https://via.placeholder.com/150";
    await addDoc(collection(db, "groups"), {
        name, photo, admin: auth.currentUser.uid, members: [auth.currentUser.uid]
    });
    closeModals();
};

// --- UI HELPERS ---
function openModal(id) {
    document.getElementById('overlay').classList.remove('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
function closeModals() { document.getElementById('overlay').classList.add('hidden'); }

document.getElementById('btn-plus').onclick = () => openModal('modal-plus');
document.getElementById('btn-show-create-group').onclick = () => openModal('modal-create-group');
document.getElementById('btn-view-profile').onclick = () => openModal('modal-profile');
document.getElementById('btn-dots').onclick = () => document.getElementById('menu-dropdown').classList.toggle('show');
document.getElementById('btn-logout').onclick = () => signOut(auth);
