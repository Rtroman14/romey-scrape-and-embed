## To log in:

gcloud auth application-default login
gcloud config set account ryan@romey.ai
gcloud config set project romey

## Deploy Google Cloud Function

gcloud functions deploy scrape-and-embed \
--gen2 \
--runtime=nodejs20 \
--region=us-west1 \
--trigger-http \
--source=. \
--memory=4Gi \
--max-instances=10 \
--entry-point=scrape-and-embed \
--timeout=1140s \
--concurrency=1 \
--allow-unauthenticated \
--env-vars-file=.env.yaml
