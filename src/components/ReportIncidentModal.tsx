"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ReportIncidentModal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Reported:", { type, description });
    // Future integration: save to db and update map
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent className="sm:max-w-[425px] bg-[#0d0d0f] border border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Report an Incident</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Help the community by reporting hazards. This will be verified by our AI system.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="type" className="text-neutral-400">Incident Type</Label>
            <Select onValueChange={(val: any) => setType(val as string)} required>
              <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-emerald-500/50">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="bg-[#0d0d0f] border-white/10 text-white">
                <SelectItem value="roadblock">Roadblock / Debris</SelectItem>
                <SelectItem value="flood">Flooding</SelectItem>
                <SelectItem value="fire">Fire / Smoke</SelectItem>
                <SelectItem value="collapse">Structural Collapse</SelectItem>
                <SelectItem value="chemical">Chemical Spill</SelectItem>
                <SelectItem value="blizzard">Blizzard</SelectItem>
                <SelectItem value="volcano">Volcanic Eruption</SelectItem>
                <SelectItem value="other">Other Hazard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="location" className="text-neutral-400">Location</Label>
            <Input id="location" value="Current GPS Location" readOnly className="bg-white/5 border-white/10 text-neutral-500 placeholder-neutral-600" />
            <p className="text-xs text-neutral-500">Uses your device's current location.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description" className="text-neutral-400">Details</Label>
            <Textarea
              id="description"
              className="bg-white/5 border-white/10 text-white placeholder-neutral-600 focus:border-emerald-500/50"
              placeholder="Describe the severity or any important details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <DialogFooter className="mt-4">
            <Button type="submit" className="btn-gradient w-full text-white font-bold">Submit Report</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
