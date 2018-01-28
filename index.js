const axios = require('axios');
const admin = require("firebase-admin");
const Session = require("./session.js");
const Queue = require('bee-queue');
const addQueue = new Queue('firestore_queue');

const session = new Session();

var serviceAccount = require("./config/serviceAccountKey.json");
var settings = require("./config/settings.json");

const addUriParam = (uri, key, value) => {
  var re = new RegExp("([?&])" + key + "=.*?(&|$)", "i");
  var separator = uri.indexOf('?') !== -1 ? "&" : "?";
  if (uri.match(re)) {
    return uri.replace(re, '$1' + key + "=" + value + '$2');
  }
  else {
    return uri + separator + key + "=" + value;
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: settings.firebase_db_url
});

const db = admin.firestore();

let restEndpoint = settings.unsplash_base_url + "/photos";

let client_id = settings.unsplash_key;
let per_page = settings.per_page;

restEndpoint = addUriParam(restEndpoint, "client_id", client_id);
restEndpoint = addUriParam(restEndpoint, "per_page", per_page);
restEndpoint = addUriParam(restEndpoint, "order_by", "oldest");

let processedPages = session.get('processed_pages', {});

const getItemCount = async () => {
  console.log("Calculating item count");
  const response = await axios.get(restEndpoint);
  return parseInt(response.headers['x-total']);
}

const createJob = async (page) => {
  if(!processedPages.hasOwnProperty("page_" + page)) {
    let page_key = "page_" + page;

    processedPages[page_key] = {
      started:  false,
      page: page
    }

    session.set('processed_pages', processedPages);

    const job = await addQueue.createJob({
      page: page,
      page_key: page_key
    }).save();

    console.log(`Job enqueued: ${job.id} [page: ${job.data.page}]`);

    job.on('succeeded', (result) => {
      console.log(`Job ${job.id} succeeded with result: ${result}`);
    })
    .on('failed', (err) => {
      console.log(`Job ${job.id} failed with error ${err.message}`);
    })
    .on('retrying', (err) => {
      console.log(`Job ${job.id} failed with error ${err.message} but is being retried!`);
    })
    .on('progress', (progress) => {
      console.log(`Job ${job.id} reported progress: ${progress}%`);
    });

    return job;

  } else {
    console.log(`Skipping page ${page}, already processed.`);
    return null;
  }
}

const processJob = async (job) => {
  let url = addUriParam(restEndpoint, "page", job.data.page);

  processedPages[job.data.page_key].started = true;
  session.set('processed_pages', processedPages);

  const res = await axios.get(url);

  for(const item of res.data) {
    await db.collection('photos').doc(item.id).set(item);
  }

  return job;
}

const sync = async () => {

  try {
    let item_count = await getItemCount();
    let total_pages = Math.ceil(item_count/per_page);
    console.log(`Discovered [${total_pages}] pages`);

    total_pages = 3; // for debugging only

    // add each job to queue
    for(let page = 1; page <= total_pages; page++) {
      createJob(page);
    }

    // start processing the queue
    addQueue.process(async (job, done) => {
      console.log(`Processing job ${job.id} [page ${job.data.page}]`);

      const finishedJob = await processJob(job);

      return done(null, job.data);

    });
  } catch (err) {
    console.log(`Error! - ${err.message}`);
  }

}
sync();
