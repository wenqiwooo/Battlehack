var http=require("http");
express=require("express")
var app=express();
var Server=http.Server(app);
var io=require("socket.io")(Server);
var redis=require("then-redis");
process.env.PORT=8888;
var signalmaster=require("signal-master")
var port=8080;
var db=redis.createClient();
db.scanUniqueSet=function(key){
  return new Promise(function(fulfill,reject){
    var promiseArray=[];
    var set={};
    var handler=function(response){
      return new Promise(function(fulfill,reject){
        response[1].forEach(function(element){
          set[element]=1;
        })
        if(response[0]!=0){
          promiseArray.push(db.sscan(key,response[0]).then(handler,function(error){
            reject(error);
          }));
        }
        fulfill();
      });
    };
    promiseArray.push(db.sscan(key,0).then(handler,function(error){
      return Promise.reject(error);
    }));
    Promise.all(promiseArray).then(function(){
      fulfill(Object.keys(set));
    });
  });
}

app.route("/tutors").get(function(req,res,next){
  db.hkeys("tutors").then(function(response){
    res.end(JSON.stringify({tutors:response}));
  })
}).post(function(req,res,next){
  data="";
  req.on("data",function(d){
    data+=d;
  });
  req.on("end",function(){
    json=JSON.parse(data);
    user=req.params.user_id;
    subjects=json.subjects;
    db.multi();
    subjects.forEach(function(subject){
      db.zadd(listKey(json.level,subject));
    });
    db.exec().then(function(res){
      res.statusCode=200;
      res.end("Request Okay");
    });
  });
});

app.route("/public/:filename").get(function(req,res,next){
  file=req.params.filename || "index.html";
  res.sendFile(__dirname+"/public/"+file);
});
io.on("connection",function(socket){
  var mode;
  var userid;
  var name;
  var currentRoom;
  socket.emit("greeting","Connected to studysocket.js");
  socket.on("init",function(json){
    userid=json.userid;
    mode=json.mode;
    name=json.name;
    if(json.mode=="tutor"){
      db.hset("tutors",userid,socket.id).then(function(response){
      currentRoom=socket.id;
      socket.join(socket.id)
      socket.emit("init",socket.id);
    },function(error){
      socket.emit("error",error);
      
      currentRoom=socket.id;
    });
    }
    else {
      db.hdel("tutors",userid);
      socket.on("hello",function(tutorId){
        console.log("hello from",userid,"to",tutorId);
        db.hget("tutors",tutorId).then(function(room){
          console.log("room",room);
          currentRoom=room;
          socket.to(currentRoom).emit("systemMessage",name+" has joined.");
          socket.join(currentRoom);
          socket.emit("systemMessage","Connected. Chat Now!");
        });
      });
    }

  })
  socket.on("chatMessage",function(message){
    console.log(currentRoom);
    console.log(message);
    socket.to(currentRoom).emit("chatMessage",{name:name
      , userid: userid
      , message:message}
      );
  });
  socket.on("disconnect",function(){
    
  })
});

Server.listen(port,function(){
  console.log("Listening on port",port);
});

function listKey(level,subject){
  return level+"-"+subject;
}