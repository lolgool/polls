const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const path = require('path');

// Configuración de la sesión
app.use(session({
    secret: 'secreto_seguro_aws_123',
    resave: false,
    saveUninitialized: true
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- BASE DE DATOS EN MEMORIA ---
// NOTA: Si reinicias el servidor, estos datos se borran.
const usuariosDB = []; 
let encuestaActual = { 
    pregunta: "Esperando encuesta...", 
    opciones: [] 
};

// --- RUTAS PÚBLICAS Y LOGIN ---

app.get('/', (req, res) => {
    // Si ya está logueado, lo mandamos a su sitio
    if (req.session.user) {
        if (req.session.user.role === 'admin') return res.redirect('/admin');
        return res.redirect('/votar');
    }
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/register', (req, res) => {
    const { username, password, role } = req.body;
    const existe = usuariosDB.find(u => u.username === username);
    if (existe) return res.send('El usuario ya existe. <a href="/">Volver</a>');
    
    usuariosDB.push({ username, password, role });
    res.redirect('/'); 
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = usuariosDB.find(u => u.username === username && u.password === password);

    if (user) {
        req.session.user = user;
        if (user.role === 'admin') res.redirect('/admin');
        else res.redirect('/votar');
    } else {
        res.send('Error de credenciales. <a href="/">Intentar de nuevo</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// --- MIDDLEWARES DE SEGURIDAD ---

function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') next();
    else res.status(403).send('Acceso denegado.');
}

function requireUser(req, res, next) {
    if (req.session.user) next();
    else res.redirect('/');
}

// --- RUTAS PROTEGIDAS ---

app.get('/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/votar', requireUser, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'usuario.html'));
});

// --- SOCKET.IO (TIEMPO REAL) ---

io.on('connection', (socket) => {
    // Enviar estado actual al conectarse
    socket.emit('actualizarDatos', encuestaActual);

    socket.on('crearEncuesta', (nuevaData) => {
        encuestaActual = nuevaData;
        io.emit('actualizarDatos', encuestaActual);
    });

    socket.on('votar', (idOpcion) => {
        const opcion = encuestaActual.opciones.find(op => op.id === idOpcion);
        if (opcion) {
            opcion.votos += 1;
            io.emit('actualizarDatos', encuestaActual);
        }
    });
});

// --- INICIAR SERVIDOR ---
const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor listo en el puerto ${PORT}`);
});