# Reddit Thread Analyzer

A Python application that analyzes Reddit threads using AI to provide insights and summaries.

## Features

- Fetch Reddit thread data including comments
- Process thread content using AI analysis
- Generate insightful summaries and analytics

## Setup

1. Clone the repository:
```bash
git clone https://github.com/JAFAR564/reddit-thread-analyzer.git
cd reddit-thread-analyzer
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Add your Reddit API credentials
   - Add your OpenRouter API key

## Usage

Run the main script:
```bash
python main.py
```

## Project Structure

- `main.py`: Main application script
- `reddit_fetcher.py`: Module for Reddit interactions
- `ai_processor.py`: Module for OpenRouter interactions
- `.env`: File to store API keys securely
- `requirements.txt`: List of Python dependencies

## License

MIT License
