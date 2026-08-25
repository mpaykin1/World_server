#!/usr/bin/env python3
import argparse,json,os,sys
from ai3d.texture_runtime_v9 import PromotionLedger
p=argparse.ArgumentParser(); p.add_argument('ledger'); p.add_argument('--secret',default=os.environ.get('TEXTURE_PROMOTION_LEDGER_SECRET','')); a=p.parse_args()
if len(a.secret)<16: raise SystemExit('TEXTURE_PROMOTION_LEDGER_SECRET/--secret must be >=16 chars')
r=PromotionLedger(a.ledger,a.secret).verify(); print(json.dumps(r,indent=2)); raise SystemExit(0 if r['ok'] else 2)
