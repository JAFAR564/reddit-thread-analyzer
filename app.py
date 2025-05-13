from flask import Flask, render_template, request
from main import process_reddit_thread
import logging

app = Flask(__name__)

# Configure logging for the Flask app
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        thread_url = request.form.get('reddit_url')
        if not thread_url:
            return render_template('index.html', error="Reddit URL is required.")

        logging.info(f"Received request to analyze URL: {thread_url}")
        # For now, using default comment_limit and models from process_reddit_thread
        # You might want to make these configurable via the form as well
        processed_data = process_reddit_thread(thread_url)

        if processed_data:
            logging.info(f"Successfully processed data for URL: {thread_url}")
            return render_template('results.html', data=processed_data)
        else:
            logging.error(f"Failed to process data for URL: {thread_url}")
            return render_template('index.html', error="Failed to process Reddit thread. Check logs for details.")
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)