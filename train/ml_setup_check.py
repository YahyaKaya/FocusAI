#!/usr/bin/env python3
"""
Quick Test Script - Validates ML Pipeline Setup
Run this before running the full ml_pipeline.py
"""

import os
import sys
from pathlib import Path

def check_python_version():
    """Verify Python 3.8+"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print(f"❌ Python 3.8+ required, found {version.major}.{version.minor}")
        return False
    print(f"✓ Python version: {version.major}.{version.minor}.{version.micro}")
    return True


def check_env_file():
    """Check if .env file exists"""
    env_path = Path('.env')
    if not env_path.exists():
        print("❌ .env file not found")
        print("   Create .env with:")
        print("   SUPABASE_URL=your-url")
        print("   SUPABASE_KEY=your-key")
        return False
    
    print(f"✓ .env file found")
    
    # Check contents
    with open(env_path) as f:
        content = f.read()
        if 'SUPABASE_URL' in content and 'SUPABASE_KEY' in content:
            print("✓ .env contains required variables")
            return True
        else:
            print("❌ .env missing SUPABASE_URL or SUPABASE_KEY")
            return False


def check_dependencies():
    """Check if required packages are installed"""
    required = [
        'pandas',
        'numpy',
        'dotenv',
        'supabase',
        'xgboost',
        'sklearn',
    ]
    
    missing = []
    for package in required:
        try:
            __import__(package)
            print(f"✓ {package}")
        except ImportError:
            print(f"❌ {package}")
            missing.append(package)
    
    if missing:
        print(f"\n⚠️  Install missing packages:")
        print(f"   pip install -r ml_requirements.txt")
        return False
    
    return True


def check_csv_file():
    """Check if training data CSV exists"""
    csv_path = Path('focus_ai_sessions.csv')
    if not csv_path.exists():
        print("❌ focus_ai_sessions.csv not found")
        print("   Run data_generator.py first")
        return False
    
    print(f"✓ CSV file found ({csv_path.stat().st_size / 1024:.1f} KB)")
    return True


def check_supabase_connection():
    """Test Supabase connection"""
    try:
        from dotenv import load_dotenv
        from supabase import create_client
        
        load_dotenv()
        url = os.getenv('SUPABASE_URL')
        key = os.getenv('SUPABASE_KEY')
        
        if not url or not key:
            print("❌ SUPABASE_URL or SUPABASE_KEY not set")
            return False
        
        client = create_client(url, key)
        
        # Try a simple query
        response = client.table("sessions").select("count").limit(1).execute()
        print("✓ Connected to Supabase")
        return True
    
    except Exception as e:
        print(f"❌ Supabase connection failed: {e}")
        return False


def main():
    """Run all checks"""
    print("\n" + "="*70)
    print("FOCUS AI - ML PIPELINE SETUP CHECK")
    print("="*70 + "\n")
    
    checks = [
        ("Python Version", check_python_version),
        ("Environment File", check_env_file),
        ("CSV Data", check_csv_file),
        ("Dependencies", check_dependencies),
        ("Supabase Connection", check_supabase_connection),
    ]
    
    results = []
    for name, check_fn in checks:
        print(f"\n📋 Checking {name}...")
        print("-" * 70)
        try:
            result = check_fn()
            results.append(result)
        except Exception as e:
            print(f"❌ Error: {e}")
            results.append(False)
    
    # Summary
    print("\n" + "="*70)
    passed = sum(results)
    total = len(results)
    
    if passed == total:
        print(f"✅ ALL CHECKS PASSED ({passed}/{total})")
        print("\n🚀 Ready to run ML pipeline:")
        print("   python ml_pipeline.py")
    else:
        print(f"⚠️  SOME CHECKS FAILED ({passed}/{total})")
        print("   Fix issues above before running pipeline")
    
    print("="*70 + "\n")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
