const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const session = require('express-session');
const path = require('path');

app.use(session({
    secret: 'secreto_seguro_aws_123',
    resave: false,
    saveUninitialized: true
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const usuariosDB = []; 
// AQUI EL CAMBIO 1: Agregamos el array "votantes"
let encuestaActual = { 
    pregunta: "Esperando encuesta...", 
    opciones: [],
    votantes: [] // Lista de usuarios que ya votaron en ESTA encuesta
};

// --- RUTA NUEVA PARA QUE EL FRONTEND SEPA QUIEN ES ---
app.get('/api/quien-soy', (req, res) => {
    if (req.session.user) {
        res.json({ username: req.session.user.username });
    } else {
        res.json({ username: null });
    }
});

app.get('/', (req, res) => {
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
        res.send('Error. <a href="/">Volver</a>');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

function requireAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') next();
    else res.status(403).send('Acceso denegado.');
}

function requireUser(req, res, next) {
    if (req.session.user) next();
    else res.redirect('/');
}

app.get('/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get('/votar', requireUser, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'usuario.html'));
});

// --- SOCKETS ---

io.on('connection', (socket) => {
    socket.emit('actualizarDatos', encuestaActual);

    socket.on('crearEncuesta', (nuevaData) => {
        // Al crear nueva encuesta, reiniciamos la lista de votantes
        encuestaActual = {
            pregunta: nuevaData.pregunta,
            opciones: nuevaData.opciones,
            votantes: [] 
        };
        io.emit('actualizarDatos', encuestaActual);
    });

    // AQUI EL CAMBIO 2: Lógica de protección de voto único
    socket.on('votar', (data) => {
        const { idOpcion, usuario } = data;

        // 1. Verificamos si este usuario YA votó en esta encuesta
        if (encuestaActual.votantes.includes(usuario)) {
            return; // Si ya votó, no hacemos nada (ignoramos el clic)
        }

        const opcion = encuestaActual.opciones.find(op => op.id === idOpcion);
        if (opcion) {
            opcion.votos += 1;
            encuestaActual.votantes.push(usuario); // Lo agregamos a la lista negra
            io.emit('actualizarDatos', encuestaActual);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor listo en el puerto ${PORT}`);
});