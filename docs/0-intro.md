# Introduction

> "It is better to have 100 functions operate on one data structure than
> 10 functions on 10 data structures." —Alan Perlis

This library is about streams.

A stream has two interesting properties:

- It has a /a current value/ (which may be `undefined`)
- It /broadcasts/ its value when it's updated

That's it.  Mostly.

