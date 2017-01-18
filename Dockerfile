FROM nodesource/precise:0.10.37 
MAINTAINER Ceros Product Team "product@ceros.com"

RUN mkdir -p /usr/lib/node_modules/share
WORKDIR /usr/lib/node_modules/share
COPY . /usr/lib/node_modules/share

EXPOSE 8000

CMD /usr/lib/node_modules/share/bin/sharejs -f /usr/lib/node_modules/share/bin/options.js
