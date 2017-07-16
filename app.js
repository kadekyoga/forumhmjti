//penanaman websocket
var express = require('express'),
	path = require('path'),
	app = express(),
	
	//proses BIND (membangun server dan meminta informasi(IP dan port) dari server)
	server = require('http').createServer(app),
	
	//proses LISTEN di server
	io = require('socket.io').listen(server),
	
	mongoose = require('mongoose'),
	port = 8080,
	users = [],
	rooms = [],
	ipbanned = [];
	
	//proses LISTEN pada port (layanan)
	//server.listen(port);
	server.listen(process.env.PORT || port);
	console.log('Connected to port ' + port);

	//koneksi ke database mongoDB melalui uri (didapat saat membuat database di mlab)
	//mongoose.connect('mongodb://localhost/chat', function(err){
	mongoose.connect(process.env.MONGOLAB_URI || 'mongodb://kadekyoga:dragonbrigandine641995@ds143588.mlab.com:43588/hmjtichatroom', function(err){
	if(err){
		console.log(err);
	}else{
		console.log('Connected to mongodb!');
	}
});

//skema database yang nanti akan disimpan sebagai objek
var chatSchema = mongoose.Schema({
	nick: String,
	memberStatus: String,
	msg: String,
	room: String,
	created: String,
	date: { type: Date, default: Date.now },
});
var Chat = mongoose.model('Message', chatSchema);

//path utk file html
app.use(express.static(path.join(__dirname + '/')));
app.use(express.static(path.join(__dirname + '/css')));
app.use(express.static(path.join(__dirname + '/images')));

//path utk load halaman awal
app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});

//proses ACCEPT ketika server menerima koneksi/handshake dari client
io.sockets.on('connection', function(socket, callback){
	
	//event new user, inputan username yang di submit
	//akan di cek apakah telah ada dalam array users atau belum
	//dan jika belum maka data akan didaftarkan
	socket.on('new user', function(data, callback){
		if(data in users){
			callback(false);
		}else{			
			newUser(data, callback);
		}
	});
	
	function newUser(data, callback){
		var defaultRoom = 'Lobby';
		var defaultMemberStatus = 'Anggota';
		
		var ip;
		var stringip = socket.request.headers['x-forwarded-for']; 
		if (stringip) {
			var stringip = stringip.split(',');
			ip = stringip[0];
		}else if (!ip) {
			ip = socket.request.connection.remoteAddress;
		}
				
		var host = socket.request.connection.remotePort;
		
		callback(true);
		socket.nickname = data;
		socket.room = defaultRoom;
		socket.memberStatus = defaultMemberStatus;
		socket.ipaddress = ip;
		socket.host = host;
		
		//if(socket.ipaddress in ipbanned){
		if (ipbanned.indexOf(socket.ipaddress) !== -1 ){
			callback(false);
			socket.emit('andadibanned', {nick: data, room: defaultRoom, memberStatus: defaultMemberStatus});
		}else{
			users[socket.nickname] = socket;
			socket.join(socket.room);
			console.log(socket.nickname + ' ' + 'joined ' + ' ' + defaultRoom);
			console.log('ipnya ' + socket.ipaddress + ' dan hostnya ' + socket.host);
			updateNicknames();
			roomClient(socket.room);
			getRooms();
			
			//event akunmu, dimana akan mengirim data yang berisi nickname serta defaultRoom ke client
			socket.emit('akunmu', {nick: data, room: defaultRoom, memberStatus: defaultMemberStatus});
			
			//membuat query dari database berdasarkan room
			var query = Chat.find({room: socket.room});
			//mengurutkan data berdasarkan date dengan batas data yang di load adalah 10 data
			query.sort('-date').limit(10).exec(function(err, docs){
				if(err) throw err;
				//console.log('sending old message');
				socket.emit('load old messages', docs);
			});
		}
	}
	
	function updateNicknames(data, callback){
		io.sockets.emit('usernames', Object.keys(users));
		var defaultMomod = 'Moderator';
		var defaultAdmin = 'Admin';
		socket.emit('statusadmin', {nick: socket.nickname, memberStatus: defaultAdmin});
		socket.emit('statusmomod', {nick: socket.nickname, memberStatus: defaultMomod});
		console.log(Object.keys(users));
	}
	
	//event new room adalah ketika membuat/bergabung dengan sebuah room
	socket.on('new rooms', function(data, callback){
		if(data in rooms){
			joinRoom(data, callback);	
		}else{
			joinRoom(data, callback);
		}
	});
	
	function joinRoom(data, callback){		
		//apakah ada orang di dalam room? jika hanya 1 orang
		//maka ketika orang tersebut keluar room, room akan dihapus
		var client = io.sockets.adapter.rooms[socket.room];
		if(client.length == 1){
			io.of('/').in(data).clients(function(error, clients){
				if (error) throw error;
				if(clients.length >=10){
					socket.emit('roommu', {room: socket.room});
					socket.emit('statuspindah', {room: data, status: 'penuh'});
				}else{
					delete rooms[socket.room];
					socket.leave(socket.room);
					console.log(socket.nickname + ' meninggalkan ' + socket.room);					
					callback(true);
					socket.room = data;
					rooms[socket.room] = socket;			
					socket.join(socket.room);
					console.log(socket.nickname + ' joined ' + socket.room);
					roomClient(socket.room);
					getRooms();
					
					//event roommu akan mengirimkan room yang dimasuki oleh client
					//yang dikirim sebagai informasi mengenari room saat itu client berada
					socket.emit('roommu', {room: socket.room});
					socket.emit('statuspindah', {room: socket.room, status: 'masih ada slot'});
					var query = Chat.find({room: socket.room});
					query.sort('-date').limit(10).exec(function(err, docs){
						if(err) throw err;
						//console.log('sending old message');
						socket.emit('load old messages', docs);
					});
				}
			});			
		}else{
			io.of('/').in(data).clients(function(error, clients){
				if (error) throw error;			
				if(clients.length >= 10){
					socket.emit('roommu', {room: socket.room});
					socket.emit('statuspindah', {room: data, status: 'penuh'});
				}else{
					//jika sisa orang di dalam room lebih dari satu
					//maka room akan tetap ada
					socket.leave(socket.room);
					console.log(socket.nickname + ' meninggalkan ' + socket.room);		
					callback(true);
					socket.room = data;
					rooms[socket.room] = socket;			
					socket.join(socket.room);
					console.log(socket.nickname + ' joined ' + socket.room);
					roomClient(socket.room);
					getRooms();
					var query = Chat.find({room: socket.room});
					
					socket.emit('roommu', {room: socket.room});
					socket.emit('statuspindah', {room: socket.room, status: 'masih ada slot'});
					query.sort('-date').limit(10).exec(function(err, docs){
						if(err) throw err;
						//console.log('sending old message');
						socket.emit('load old messages', docs);
					});		
				}
			});
		}
	}
	
	//mendapatkan room dan mendapatkan jumlah client dalam room
	//sebagai fungsi tambahan saja
	function getRooms(){
		//console.log(rooms);
		io.sockets.emit('roomlist', Object.keys(rooms));
		var cacahData = Object.keys(rooms).length;		
		for(var i=0; i<cacahData; i++){
			var client = io.sockets.adapter.rooms[Object.keys(rooms)[i]];
			//console.log(Object.keys(rooms)[i] + '[' + client.length + ']');
		}		
		io.sockets.emit('roomlist', Object.keys(rooms));
	}
	
	//fungsi tambahan utk mengetahui jumlah client 
	function roomClient(room){
		io.of('/').in(socket.room).clients(function(error, clients){
			if (error) throw error;	
			if(clients.length == 0){
				delete rooms[socket.room];
			}
			console.log('jumlah client room ' + socket.room + ' adalah ' + clients.length);
			console.log(' ');
		});
	}
	
	
	//menghancurkan koneksi, ketika client menutup aplikasi
	//koneksi yang dibangun akan dihancurkan, dan username dari koneksi yang sebelumnya dibangun
	//akan dihapus
	socket.on('disconnect', function(data){
		if(!socket.nickname) return;			
		socket.leave(socket.room);
		console.log(socket.nickname + ' meninggalkan ' + socket.room);
		delete users[socket.nickname];
		updateNicknames();
		getRooms();
		roomClient(socket.room);
	});
	
	
	//SEND MESSAGE DIGUNAKAN UNTUK MENGIRIM PESAN BESERTA KODE
	// /luadmin, /lumomod, /kick, /banned, /unban, /clear, dan /w
	socket.on('send message', function(data, callback){
		var msg = data.trim();
		
		//ini kode untuk jadi admin
		//pesan dipotong 9 karakter untuk /luadmin
		//sebelum karakter ' ' adalah nama yang ditunjuk sebagai admin
		//memberStatusnya menjadi admin
		if(msg.substr(0,9) === '/luadmin '){
			msg = msg.substr(9);
			var ind = msg.indexOf(' ');
			if(ind !== -1){
				var name = msg.substring(0, ind);
				var msg = msg.substring(ind + 1);
				if(name in users){					
					var defaultAdmin = 'Admin';
					users[name].memberStatus = defaultAdmin;
					users[name].emit('statusadmin', {nick: name, memberStatus: defaultAdmin});					
					users[name].emit('pesanadmin', {msg: msg, memberStatus: socket.memberStatus,  sender: socket.nickname});
					users[name].broadcast.emit('pesanadmin', {msg: msg, memberStatus: socket.memberStatus,  sender: socket.nickname});
					//socket.broadcast.to(socket.room).emit('new message', { msg: msg, nick: socket.nickname, room: socket.room });
				}else{
					callback('Error: Enter a valid users');
				}
			}else{
				callback('Error: Please enter a message for your whisper');
			}
		}		
		//ini kode untuk jadi moderator
		//pesan dipotong 9 karakter untuk /lumomod
		//sebelum karakter ' ' adalah nama yang ditunjuk sebagai moderator
		//memberStatusnya menjadi moderator
		else if(msg.substr(0,9) === '/lumomod '){
			msg = msg.substr(9);
			var ind = msg.indexOf(' ');
			if(ind !== -1){
				var name = msg.substring(0, ind);
				var msg = msg.substring(ind + 1);
				if(name in users){
					if(socket.memberStatus == 'Admin'){
						var defaultMomod = 'Moderator';
						users[name].memberStatus = defaultMomod;
						users[name].emit('statusmomod', {nick: name, memberStatus: defaultMomod});
						socket.broadcast.emit('pesanadmin', {msg: msg, memberStatus: socket.memberStatus,  sender: socket.nickname});
						socket.emit('pesanadmin', {msg: msg, memberStatus: socket.memberStatus,  sender: socket.nickname});
					}else{						
						callback('Error: anda bukan admin');
					}
				}else{
						callback('Error: tidak ada di user');
				}					
			}else{
				callback('Error: Please enter a message for your whisper');
			}	
		}
		
		//ini kode untuk kick user 
		//pesan dipotong 6 karakter untuk /kick
		//sebelum karakter ' ' adalah nama yang di kick
		//status yang meng-kick akan di cek apakah admin atau moderator
		//moderator tidak boleh kick admin
		//user yang di kick, namanya akan dihapus dari daftar user dan form input chat nya akan di disable
		//NOTE : KICK USER TIDAK MENUTUP (CLOSE) CONNECTION MAUPUN DISCONNECT CONNECTION SI USER
		//MELAINKAN HANYA DIHAPUS DARI DAFTAR DAN DILARANG MELAKUKAN CHAT LAGI, NAMUN TETAP BISA MASUK ULANG.
		else if(msg.substr(0,6) === '/kick '){
			msg = msg.substr(6);
			var ind = msg.indexOf(' ');
			if(ind !== -1){
				var name = msg.substring(0, ind);  
				var msg = msg.substring(ind + 1);
				if(name in users){
					if(socket.memberStatus == 'Admin' || socket.memberStatus == 'Moderator'){
						if(socket.memberStatus == 'Moderator' && users[name].memberStatus == 'Admin'){
							callback('Error: anda tidak boleh kick admin');
							console.log(users[name].memberStatus + ' tidak dapat dikick oleh ' + socket.memberStatus);
						}else{
							var home = "";
							socket.broadcast.emit('pesandikick', {nick: socket.nickname, memberStatus: socket.memberStatus, msg: msg});
							socket.emit('pesandikick', {nick: socket.nickname, memberStatus: socket.memberStatus, msg: msg});
							users[name].emit('disablechat', {nick: name, url: home});
						}						
					}else{						
						callback('Error: anda bukan admin');
					}
				}else{
						callback('Error: tidak ada di user');
				}					
			}else{
				callback('Error: Please enter a message for your whisper');
			}	
		}
		
		//ini kode untuk banned user 
		//pesan dipotong 8 karakter untuk /banned
		//sebelum karakter ' ' adalah nama yang di banned
		//status yang meng-kick akan di cek apakah admin atau moderator
		//moderator tidak boleh banned admin
		//user yang di banned, namanya akan dihapus dari daftar user dan form input nya akan di disable
		//NOTE : BANNED USER TIDAK MENUTUP (CLOSE) CONNECTION MAUPUN DISCONNECT CONNECTION SI USER
		//MELAINKAN HANYA DIHAPUS DARI DAFTAR DAN DILARANG MELAKUKAN CHAT LAGI, NAMUN TIDAK BISA MASUK ULANG KARENA IP NYA SUDAH MASUK DAFTAR BLACKLIST.
		else if(msg.substr(0,8) === '/banned '){
			msg = msg.substr(8);
			var ind = msg.indexOf(' ');
			if(ind !== -1){
				var name = msg.substring(0, ind);				
				var msg = msg.substring(ind + 1);
				if(name in users){
					if(socket.memberStatus == 'Admin' || socket.memberStatus == 'Moderator'){
						if(socket.memberStatus == 'Moderator' && users[name].memberStatus == 'Admin'){
							callback('Error: anda tidak boleh banned admin');
							console.log(users[name].memberStatus + ' tidak dapat dibanned oleh ' + socket.memberStatus);
						}else{
							//users[name].ipaddress = data;
							//var ipban = users[name].request.headers['x-forwarded-for'] || users[name].request.connection.remoteAddress;
							var ip;
							var stringip = users[name].request.headers['x-forwarded-for']; 
							if (stringip) {
								var stringip = stringip.split(',');
								ip = stringip[0];
							}else if (!ip) {
								ip = socket.request.connection.remoteAddress;
							}							
							ipbanned.push(ip);
							console.log(ip);
							socket.broadcast.emit('pesandibanned', {nick: socket.nickname, memberStatus: socket.memberStatus, msg: msg});
							socket.emit('pesandibanned', {nick: socket.nickname, memberStatus: socket.memberStatus, msg: msg});
							var home = "";
							users[name].emit('disablechat', {nick: name, url: home});
							console.log(Object.keys(ipbanned).length);
						}						
					}else{						
						callback('Error: anda bukan admin');
					}
				}else{
						callback('Error: tidak ada di user');
				}					
			}else{
				callback('Error: Please enter a message for your whisper');
			}	
		}
		
		//ini kode untuk unbanned semua user 
		//pesan dipotong 12 karakter untuk /unbanned
		//di socket.io belum dimungkinkan untuk unbanned perIP sehingga diakali dengan mengosongkan daftar ip yang di banned saja.
		else if(msg.substr(0,12) === '/unbannedall'){
			msg = msg.substr(12);
			var ind = msg.indexOf(' ');
			var msg = msg.substring(ind + 1);
			if(ind !== -1){
				if(socket.memberStatus == 'Admin' || socket.memberStatus == 'Moderator'){
					ipbanned = [];
					socket.broadcast.emit('pesandibanned', {nick: socket.nickname, memberStatus: socket.memberStatus, msg: msg});
					socket.emit('pesandibanned', {nick: socket.nickname, memberStatus: socket.memberStatus, msg: msg});
					console.log(Object.keys(ipbanned).length);
				}else{						
					callback('Error: anda bukan admin maupun moderator');
				}				
			}else{
				callback('Error: Please enter a message for your whisper');
			}	
		}
		
		//ini kode untuk clear windows untuk membersihkan jendela chat
		//pesan dipotong 6 karakter untuk /clear
		//jendela pada client akan dibersihkan
		else if(msg.substr(0,6) === '/clear'){
			msg = msg.substr(6);
			var ind = msg.indexOf(' ');
			if(!ind == 0){
				socket.emit('bersihkan jendela', {nick: socket.nickname});			
			}else{
				callback('clear tidak memerlukan message, cukup /clear saja');
			}	
		}
		
		
		//ini kode untuk whisper (private chat)
		//pesan dipotong 3 karakter untuk /w
		//sebelum karakter ' ' adalah nama yang akan dikirimi pesan
		//pesan private tidak akan disimpan dalam database
		//pesan yang dikirim akan ditampilkan pada jendela si pengirim dan penerima saja
		//waktu yang digunakan adalah waktu server yang disesuaikan dengan waktu indonesia barat
		else if(msg.substr(0,3) === '/w '){
			msg = msg.substr(3);
			var ind = msg.indexOf(' ');
			if(ind !== -1){
				var name = msg.substring(0, ind);
				var msg = msg.substring(ind + 1);
				if(name in users){
					var d = new Date();
					var weekday = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

					var hari = weekday[d.getDay()];
					var tahun = d.getFullYear(); 
					var bulan= d.getMonth()+1;
					var tanggal = d.getDate();
					var jam = d.getHours()+7;
					var menit = d.getMinutes();
					var detik = d.getSeconds();								
					var waktu = hari + ' ' + tanggal + '-' + bulan + '-' + tahun + ' ' + jam + ':' + menit + ':' + detik;
					
					socket.emit('sender', {msg: msg, receiver: name, created: waktu});
					users[name].emit('whisper', {msg: msg, sender: socket.nickname, created: waktu});
					console.log('this is ' + name);
				}else{
					callback('Error: Enter a valid users');
				}				
			}else{
				callback('Error: Please enter a message for your whisper');
			}
		}
		
		//jika pesan tidak ada kode /xxx maka akan menjadi public chat
		//pesan publik ini akan disimpan dalam database
		//waktu yang digunakan/ditampilkan di jendela chat adalah waktu server yang disesuaikan dengan WIB
		//untuk mengurutkan history chat menggunakan waktu dari database agar lebih akurat
		else{
			var d = new Date();
			var weekday = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

			var hari = weekday[d.getDay()];
			var tahun = d.getFullYear(); 
			var bulan= d.getMonth()+1;
			var tanggal = d.getDate();
			var jam = d.getHours()+7;
			var menit = d.getMinutes();
			var detik = d.getSeconds();								
			var waktu = hari + ' ' + tanggal + '-' + bulan + '-' + tahun + ' ' + jam + ':' + menit + ':' + detik;
			
			//masukkan pesan ke skema database kemudian simpan dalam database sebagai history chat
			var newMsg = new Chat({msg: msg, nick: socket.nickname, room: socket.room, created: waktu});
			newMsg.save(function(err){
				if(err)	throw err;
			});
			io.sockets.in(socket.room).emit('new message', {msg: msg, nick: socket.nickname, created: waktu});
			console.log(waktu);
			//socket.broadcast.to(socket.room).emit('new message', { msg: msg, nick: socket.nickname, room: socket.room });
		}
	});
});
